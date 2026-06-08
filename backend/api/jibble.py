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
    """Work hours timesheets - one row per person per day"""
    from datetime import datetime as dt, timezone, timedelta

    today = str(datetime.date.today())
    if not date_from:
        date_from = today
    if not date_to:
        date_to = today

    # Fetch 1 extra day on each side to catch Out entries that span midnight
    try:
        df = datetime.date.fromisoformat(date_from)
        dt_ = datetime.date.fromisoformat(date_to)
        fetch_from = str(df - datetime.timedelta(days=1))
        fetch_to   = str(dt_ + datetime.timedelta(days=1))
    except Exception:
        fetch_from = date_from
        fetch_to   = date_to

    token = get_jibble_token()
    raw_entries = []
    if token:
        try:
            res = requests.get(
                f'{JIBBLE_TRACKING_URL}/timeEntries',
                headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
                params={'from': fetch_from, 'to': fetch_to, '$top': 1000},
                timeout=15,
            )
            if res.status_code == 200:
                raw_entries = res.json().get('value', [])
        except Exception:
            pass

    if not raw_entries:
        raw_entries = get_attendance(date_from, date_to)

    people = get_employees()
    people_map = {p['id']: p for p in people if p.get('isActive')}
    now = dt.now(timezone.utc)

    # ── Keep only In/Out entries, skip breaks ─────────────────────────────────
    filtered = []
    for entry in raw_entries:
        entry_type = entry.get('type', '')
        person_id  = entry.get('personId') or entry.get('memberId') or entry.get('userId')
        time_str   = entry.get('time') or entry.get('localTime')
        if not person_id or not time_str or entry_type not in ('In', 'Out'):
            continue
        filtered.append(entry)

    # ── Sort by time ──────────────────────────────────────────────────────────
    filtered.sort(key=lambda e: e.get('time') or e.get('localTime') or '')

    # ── Pair In/Out entries per person ────────────────────────────────────────
    # sessions[(person_id, belongsToDate)] = list of (in_dt, out_dt or None)
    sessions = {}
    open_ins  = {}  # person_id -> {'in': dt, 'date': str}

    for entry in filtered:
        person_id  = entry.get('personId') or entry.get('memberId') or entry.get('userId')
        entry_type = entry.get('type', '')
        time_str   = entry.get('time') or entry.get('localTime')
        belongs_to = entry.get('belongsToDate') or (time_str[:10] if time_str else None)

        try:
            t = dt.fromisoformat(time_str.replace('Z', '+00:00'))
        except Exception:
            continue

        if entry_type == 'In':
            if person_id in open_ins:
                # Close previous open session
                prev = open_ins[person_id]
                pk = (person_id, prev['date'])
                sessions.setdefault(pk, []).append((prev['in'], t))
            open_ins[person_id] = {'in': t, 'date': belongs_to}

        elif entry_type == 'Out':
            if person_id in open_ins:
                in_data = open_ins.pop(person_id)
                pk = (person_id, in_data['date'])
                sessions.setdefault(pk, []).append((in_data['in'], t))

    # Handle still-open sessions
    for person_id, in_data in open_ins.items():
        pk = (person_id, in_data['date'])
        sessions.setdefault(pk, []).append((in_data['in'], None))

    # ── Build one row per (person, date) — only for dates in requested range ──
    result = []
    for (person_id, date), pairs in sorted(sessions.items()):
        # Only include rows within the requested date range
        if not (date_from <= date <= date_to):
            continue

        person_info   = people_map.get(person_id, {})
        total_seconds = 0
        first_in      = None
        last_out      = None
        is_ongoing    = False

        for in_t, out_t in pairs:
            if out_t:
                # Cap out_t at end of this date (23:59:59 IST = 18:29:59 UTC)
                try:
                    day_end = dt.fromisoformat(f"{date}T23:59:59+05:30").astimezone(timezone.utc)
                    capped_out = min(out_t, day_end)
                except Exception:
                    capped_out = out_t
                total_seconds += max(0, int((capped_out - in_t).total_seconds()))
                if last_out is None or capped_out > last_out:
                    last_out = capped_out
            else:
                if date == today:
                    total_seconds += max(0, int((now - in_t).total_seconds()))
                    is_ongoing = True
                else:
                    # Old open session — cap at end of that day
                    try:
                        day_end = dt.fromisoformat(f"{date}T23:59:59+05:30").astimezone(timezone.utc)
                        total_seconds += max(0, int((day_end - in_t).total_seconds()))
                        if last_out is None or day_end > last_out:
                            last_out = day_end
                    except Exception:
                        pass
            if first_in is None or in_t < first_in:
                first_in = in_t

        if total_seconds > 0:
            result.append({
                'personName':   person_info.get('fullName', person_id),
                'position':     person_info.get('positionName', ''),
                'date':         date,
                'totalSeconds': total_seconds,
                'startTime':    first_in.isoformat() if first_in else None,
                'endTime':      last_out.isoformat() if last_out else None,
                'activityName': person_info.get('activityName', ''),
                'isOngoing':    is_ongoing,
            })

    # ── Fallback for today using /people ──────────────────────────────────────
    if not result and date_from == today:
        for p in people:
            if not p.get('isActive') or p.get('latestTimeEntryType') != 'In':
                continue
            try:
                s = dt.fromisoformat(p['latestTimeEntryTime'].replace('Z', '+00:00'))
                seconds = max(0, int((now - s).total_seconds()))
                if seconds > 0:
                    result.append({
                        'personName':   p.get('fullName', ''),
                        'position':     p.get('positionName', ''),
                        'date':         today,
                        'totalSeconds': seconds,
                        'startTime':    p['latestTimeEntryTime'],
                        'endTime':      None,
                        'activityName': p.get('activityName', ''),
                        'isOngoing':    True,
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