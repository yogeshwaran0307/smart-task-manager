import requests
import os
import datetime

# ─────────────────────────────────────────────────────────────
# JIBBLE API CONFIG
# ─────────────────────────────────────────────────────────────
JIBBLE_TOKEN_URL     = 'https://identity.prod.jibble.io/connect/token'
JIBBLE_BASE_URL      = 'https://time-attendance.prod.jibble.io/v1'
JIBBLE_TRACKING_URL  = 'https://time-tracking.prod.jibble.io/v1'

_cached_token     = None
_token_expires_at = None


# ─────────────────────────────────────────────────────────────
# TOKEN — cached for 50 minutes to avoid rate limits
# ─────────────────────────────────────────────────────────────
def get_jibble_token():
    global _cached_token, _token_expires_at

    now = datetime.datetime.utcnow()
    if _cached_token and _token_expires_at and now < _token_expires_at:
        return _cached_token

    try:
        res = requests.post(
            JIBBLE_TOKEN_URL,
            data={
                'grant_type':    'client_credentials',
                'client_id':     os.environ.get('JIBBLE_KEY_ID', ''),
                'client_secret': os.environ.get('JIBBLE_KEY_SECRET', ''),
            },
            timeout=10,
        )
        if res.status_code == 200:
            data = res.json()
            _cached_token     = data.get('access_token')
            _token_expires_at = now + datetime.timedelta(minutes=50)
            return _cached_token
        return None
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────
# SAFE GET WRAPPER — never crashes your app
# ─────────────────────────────────────────────────────────────
def jibble_get(endpoint, params=None):
    try:
        token = get_jibble_token()
        if not token:
            return None
        res = requests.get(
            f'{JIBBLE_BASE_URL}{endpoint}',
            headers={
                'Authorization': f'Bearer {token}',
                'Content-Type':  'application/json',
            },
            params=params,
            timeout=10,
        )
        if res.status_code == 200:
            return res.json()
        return None
    except Exception:
        return None


def jibble_get_tracking(endpoint, params=None):
    """Use time-tracking base URL for People/Timesheets endpoints"""
    try:
        token = get_jibble_token()
        if not token:
            return None
        res = requests.get(
            f'{JIBBLE_TRACKING_URL}{endpoint}',
            headers={
                'Authorization': f'Bearer {token}',
                'Content-Type':  'application/json',
            },
            params=params,
            timeout=10,
        )
        if res.status_code == 200:
            return res.json()
        return None
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────
# JIBBLE DATA FUNCTIONS
# ─────────────────────────────────────────────────────────────

def get_who_is_in():
    """Who is currently clocked in — derived from people's latestTimeEntryType"""
    people = get_employees()
    result = []
    for p in people:
        if not p.get('isActive'):
            continue
        entry_type = p.get('latestTimeEntryType', '')
        result.append({
            'name': p.get('fullName', ''),
            'position': p.get('positionName', ''),
            'isIn': entry_type == 'In',
            'clockIn': p.get('latestTimeEntryTime') if entry_type == 'In' else None,
            'clockOut': p.get('latestTimeEntryTime') if entry_type == 'Out' else None,
            'activity': p.get('activityName', ''),
            'project': p.get('projectName', ''),
            'id': p.get('id', ''),
        })
    return result


def get_attendance(date_from=None, date_to=None):
    """Attendance records for a date range"""
    if not date_from:
        date_from = str(datetime.date.today())
    if not date_to:
        date_to = str(datetime.date.today())
    result = jibble_get('/attendance', params={'from': date_from, 'to': date_to})
    if result is None:
        result = jibble_get_tracking('/attendance', params={'from': date_from, 'to': date_to})
    if result is None:
        return []
    if isinstance(result, list):
        return result
    return result.get('value', result.get('data', []))


def get_timesheets(date_from=None, date_to=None):
    """Work hours timesheets - built from attendance records for a date range"""
    from datetime import datetime as dt, timezone

    today = str(datetime.date.today())
    if not date_from:
        date_from = today
    if not date_to:
        date_to = today

    # ── 1. Fetch attendance records (covers all date ranges) ──────────────────
    attendance_records = get_attendance(date_from, date_to)

    # ── 2. Build a lookup of active people by id ──────────────────────────────
    people = get_employees()
    people_map = {p['id']: p for p in people if p.get('isActive')}

    # ── 3. Aggregate seconds per person across all records in the range ───────
    aggregated = {}  # person_id -> dict

    for rec in attendance_records:
        person_id = (
            rec.get('personId') or
            rec.get('memberId') or
            rec.get('userId') or
            rec.get('id')
        )
        name = (
            rec.get('personName') or
            rec.get('memberName') or
            rec.get('fullName') or
            (people_map.get(person_id, {}).get('fullName', '') if person_id else '')
        )
        position = (
            rec.get('positionName') or
            (people_map.get(person_id, {}).get('positionName', '') if person_id else '')
        )

        start = rec.get('startTime') or rec.get('clockIn') or rec.get('timeIn')
        end   = rec.get('endTime')   or rec.get('clockOut') or rec.get('timeOut')
        rec_date = rec.get('date') or date_from

        seconds = 0
        if start and end:
            try:
                s = dt.fromisoformat(start.replace('Z', '+00:00'))
                e = dt.fromisoformat(end.replace('Z', '+00:00'))
                seconds = max(0, int((e - s).total_seconds()))
            except Exception:
                pass
        elif start and not end:
            # Active session — count up to now
            try:
                s = dt.fromisoformat(start.replace('Z', '+00:00'))
                seconds = max(0, int((dt.now(timezone.utc) - s).total_seconds()))
            except Exception:
                pass

        # Pre-computed duration field (some Jibble responses include it)
        if seconds == 0:
            seconds = int(
                rec.get('totalSeconds') or
                rec.get('workedSeconds') or
                rec.get('duration') or 0
            )

        key = person_id or name
        if key not in aggregated:
            aggregated[key] = {
                'personName': name,
                'position': position,
                'date': rec_date,
                'totalSeconds': 0,
                'startTime': start,
                'endTime': end,
                'activityName': rec.get('activityName', ''),
                'isOngoing': not bool(end),
            }
        aggregated[key]['totalSeconds'] += seconds
        # Keep earliest clock-in and latest clock-out across the range
        if start and (not aggregated[key]['startTime'] or start < aggregated[key]['startTime']):
            aggregated[key]['startTime'] = start
        if end and (not aggregated[key]['endTime'] or end > aggregated[key]['endTime']):
            aggregated[key]['endTime'] = end
        if not end:
            aggregated[key]['isOngoing'] = True

    result = [v for v in aggregated.values() if v['totalSeconds'] > 0]

    # ── 4. Fallback for today: use latestTimeEntryTime from /people if ────────
    #       attendance returned nothing (e.g. free-plan Jibble limits)
    if not result and date_from == today:
        for p in people:
            if not p.get('isActive'):
                continue
            if p.get('latestTimeEntryType') != 'In':
                continue
            try:
                s = dt.fromisoformat(p['latestTimeEntryTime'].replace('Z', '+00:00'))
                seconds = max(0, int((dt.now(timezone.utc) - s).total_seconds()))
                if seconds > 0:
                    result.append({
                        'personName': p.get('fullName', ''),
                        'position': p.get('positionName', ''),
                        'date': today,
                        'totalSeconds': seconds,
                        'startTime': p['latestTimeEntryTime'],
                        'endTime': None,
                        'activityName': p.get('activityName', ''),
                        'isOngoing': True,
                    })
            except Exception:
                pass

    return result

def get_employees():
    """All employees/people from Jibble"""
    result = jibble_get_tracking('/people')
    if result is None:
        return []
    if isinstance(result, list):
        return result
    return result.get('value', result.get('data', []))


def get_holidays():
    """Company holidays from Jibble"""
    result = jibble_get('/holidays')
    if result is None:
        return []
    if isinstance(result, list):
        return result
    return result.get('value', result.get('data', []))


def get_schedules():
    """Work schedules/shifts from Jibble"""
    result = jibble_get('/schedules')
    if result is None:
        return []
    if isinstance(result, list):
        return result
    return result.get('value', result.get('data', []))


def get_person_attendance(person_id, date_from=None, date_to=None):
    """Attendance for a specific person"""
    if not date_from:
        date_from = str(datetime.date.today())
    if not date_to:
        date_to = str(datetime.date.today())
    result = jibble_get(f'/attendance/{person_id}', params={
        'from': date_from,
        'to':   date_to,
    })
    if result is None:
        return []
    if isinstance(result, list):
        return result
    return result.get('value', result.get('data', []))


def test_connection():
    """Test if Jibble API credentials are working"""
    token = get_jibble_token()
    if not token:
        return {
            'connected': False,
            'error': 'Could not get token — check JIBBLE_KEY_ID and JIBBLE_KEY_SECRET'
        }
    employees = get_employees()
    attendance = get_who_is_in()
    return {
        'connected': True,
        'employee_count': len(employees),
        'attendance_count': len(attendance),
        'employees_sample': employees[:2],
        'attendance_sample': attendance[:2],
        'message': f'✅ Connected to Jibble — {len(employees)} employees, {len(attendance)} clocked in'
    }