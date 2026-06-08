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
    """Work hours timesheets - one entry per person per day"""
    if not date_from:
        date_from = str(datetime.date.today())
    if not date_to:
        date_to = str(datetime.date.today())

    people = get_employees()
    result = []

    for p in people:
        if not p.get('isActive'):
            continue

        person_id = p.get('id')
        name = p.get('fullName', '').strip()
        position = p.get('positionName', '')

        # Get time entries for date range
        entries = jibble_get_tracking(
            '/timeEntries',
            params={
                'personId': person_id,
                'from': date_from,
                'to': date_to,
            }
        )

        if isinstance(entries, dict):
            entries = entries.get('value', entries.get('data', []))

        if not entries:
            # Fallback: use latestTimeEntryTime for today only
            today = str(datetime.date.today())
            if date_from == today and p.get('latestTimeEntryType') == 'In':
                try:
                    from datetime import datetime as dt, timezone
                    s = dt.fromisoformat(
                        p['latestTimeEntryTime'].replace('Z', '+00:00')
                    )
                    now = dt.now(timezone.utc)
                    total_seconds = int((now - s).total_seconds())
                    result.append({
                        'personName': name,
                        'position': position,
                        'date': today,
                        'totalSeconds': total_seconds,
                        'startTime': p['latestTimeEntryTime'],
                        'endTime': None,
                        'activityName': p.get('activityName', ''),
                        'isOngoing': True,
                    })
                except Exception:
                    pass
            continue

        # Group entries by date
        from collections import defaultdict
        daily = defaultdict(lambda: {
            'seconds': 0,
            'clock_in': None,
            'clock_out': None,
            'activity': '',
        })

        for entry in entries:
            start = entry.get('startTime')
            end = entry.get('endTime')
            activity = entry.get('activityName', '') or ''

            if not start:
                continue

            try:
                from datetime import datetime as dt, timezone
                s = dt.fromisoformat(start.replace('Z', '+00:00'))
                date_key = s.astimezone(
                    datetime.timezone(datetime.timedelta(hours=5, minutes=30))
                ).strftime('%Y-%m-%d')

                if not daily[date_key]['clock_in']:
                    daily[date_key]['clock_in'] = start

                if end:
                    e = dt.fromisoformat(end.replace('Z', '+00:00'))
                    secs = int((e - s).total_seconds())
                    daily[date_key]['seconds'] += secs
                    daily[date_key]['clock_out'] = end
                else:
                    # Ongoing
                    now = dt.now(timezone.utc)
                    secs = int((now - s).total_seconds())
                    daily[date_key]['seconds'] += secs

                if activity:
                    daily[date_key]['activity'] = activity
            except Exception:
                pass

        for date_key, day_data in sorted(daily.items()):
            if day_data['seconds'] > 0:
                result.append({
                    'personName': name,
                    'position': position,
                    'date': date_key,
                    'totalSeconds': day_data['seconds'],
                    'startTime': day_data['clock_in'],
                    'endTime': day_data['clock_out'],
                    'activityName': day_data['activity'],
                    'isOngoing': day_data['clock_out'] is None,
                })

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