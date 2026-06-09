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
    """
    Work hours timesheets built from /timeEntries.
    Jibble timeEntries schema: each record has 'time', 'type' (In/Out/StartBreak/EndBreak),
    'personId', 'belongsToDate'. We pair In→Out per person per day.
    """
    from datetime import datetime as dt, timezone

    today = str(datetime.date.today())
    if not date_from:
        date_from = today
    if not date_to:
        date_to = today

    # ── 1. Fetch time entries (API ignores date params; fetch recent 500 desc) ──
    # The API returns oldest-first by default and ignores from/to filters.
    # We request newest-first so recent weeks/months are always included.
    raw = jibble_get_tracking('/timeEntries', params={
        'from': date_from,
        'to': date_to,
        '$top': 500,
        '$orderby': 'time desc',
    })
    if isinstance(raw, dict):
        all_entries = raw.get('value', raw.get('data', []))
    elif isinstance(raw, list):
        all_entries = raw
    else:
        all_entries = []

    # Client-side date filter using belongsToDate (API ignores from/to params)
    entries = [
        e for e in all_entries
        if date_from <= (e.get('belongsToDate') or '') <= date_to
    ]

    # ── 2. Build per-person lookup from /people ───────────────────────────────
    people = get_employees()
    people_map = {p['id']: p for p in people}

    # ── 3. Group entries by personId, sorted by time ──────────────────────────
    from collections import defaultdict
    by_person = defaultdict(list)
    for e in entries:
        pid = e.get('personId')
        if pid:
            by_person[pid].append(e)

    # Sort each person's entries chronologically
    for pid in by_person:
        by_person[pid].sort(key=lambda x: x.get('time', ''))

    # ── 4. Pair In→Out per person, sum seconds ────────────────────────────────
    result = []

    for pid, person_entries in by_person.items():
        person = people_map.get(pid, {})
        name = person.get('fullName', pid)
        position = person.get('positionName', '')

        total_seconds = 0
        first_clock_in = None
        last_clock_out = None
        pending_in_time = None  # UTC datetime of last unpaired "In"

        for e in person_entries:
            entry_type = e.get('type', '')
            raw_time = e.get('time') or e.get('localTime', '')
            if not raw_time:
                continue

            try:
                t = dt.fromisoformat(raw_time.replace('Z', '+00:00'))
            except Exception:
                continue

            if entry_type == 'In':
                # If there's already a pending In without an Out, close it first
                # (multiple In without Out — use new In as boundary)
                pending_in_time = t
                if first_clock_in is None:
                    first_clock_in = raw_time

            elif entry_type == 'Out':
                if pending_in_time is not None:
                    diff = int((t - pending_in_time).total_seconds())
                    if diff > 0:
                        total_seconds += diff
                    pending_in_time = None
                last_clock_out = raw_time

            # StartBreak / EndBreak / other types — ignore for total time

        # If still clocked in at end of range (no paired Out)
        if pending_in_time is not None:
            now = dt.now(timezone.utc)
            diff = int((now - pending_in_time).total_seconds())
            if diff > 0:
                total_seconds += diff

        if total_seconds > 0:
            result.append({
                'personName': name,
                'position': position,
                'date': date_from,
                'totalSeconds': total_seconds,
                'startTime': first_clock_in,
                'endTime': last_clock_out,
                'activityName': person.get('activityName', ''),
                'isOngoing': pending_in_time is not None,
            })

    # ── 5. Fallback for today: use /people latestTimeEntryTime ────────────────
    #       covers the case where /timeEntries returns nothing (free-plan limit)
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