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
    from datetime import datetime as dt, timezone

    today = str(datetime.date.today())
    if not date_from:
        date_from = today
    if not date_to:
        date_to = today

    token = get_jibble_token()
    raw_entries = []
    if token:
        try:
            url = f'{JIBBLE_TRACKING_URL}/timeEntries'
            params = {'from': date_from, 'to': date_to, '$top': 500}
            headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
            page = 0
            while url and page < 20:
                res = requests.get(url, headers=headers, params=params, timeout=15)
                if res.status_code != 200:
                    break
                data = res.json()
                entries = data.get('value', [])
                raw_entries.extend(entries)
                next_url = data.get('@odata.nextLink') or data.get('nextLink')
                if next_url and len(entries) > 0:
                    url = next_url
                    params = {}
                else:
                    break
                page += 1
        except Exception:
            pass

    if not raw_entries:
        raw_entries = get_attendance(date_from, date_to)

    people = get_employees()
    people_map = {p['id']: p for p in people if p.get('isActive')}
    now = dt.now(timezone.utc)

    # ── Deduplicate: remove Archived copies of edited entries only
    # Use entry ID — keep Active version over Archived for same entry
    dedup = {}
    for entry in raw_entries:
        person_id  = entry.get('personId') or entry.get('memberId') or entry.get('userId')
        entry_type = entry.get('type', '')
        time_str   = entry.get('time') or entry.get('localTime')
        belongs_to = entry.get('belongsToDate') or (time_str[:10] if time_str else None)
        status     = entry.get('status', 'Active')
        entry_id   = entry.get('id', '')

        if not person_id or not time_str or not belongs_to or entry_type not in ('In', 'Out'):
            continue
        if not (date_from <= belongs_to <= date_to):
            continue

        # Use minute-level key to catch near-duplicate entries (same person, type, minute)
        time_minute = time_str[:16] if time_str else ''
        key = (person_id, entry_type, time_minute)
        if key not in dedup:
            dedup[key] = entry
        else:
            existing = dedup[key]
            existing_active = existing.get('status', 'Active') == 'Active'
            this_active     = status == 'Active'
            if this_active and not existing_active:
                dedup[key] = entry

    clean_entries = list(dedup.values())

    # ── Pair In/Out per person per day ────────────────────────────────────────
    sessions = {}   # (person_id, date) -> [{'in': dt, 'out': dt|None}]
    open_ins  = {}  # person_id -> {'in': dt, 'date': str}

    for entry in sorted(clean_entries, key=lambda e: e.get('time') or e.get('localTime') or ''):
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
                # Close previous open session before starting new one
                prev = open_ins[person_id]
                pk = (person_id, prev['date'])
                sessions.setdefault(pk, []).append({'in': prev['in'], 'out': t})
            open_ins[person_id] = {'in': t, 'date': belongs_to}

        elif entry_type == 'Out':
            if person_id in open_ins:
                in_data = open_ins.pop(person_id)
                pk = (person_id, in_data['date'])
                sessions.setdefault(pk, []).append({'in': in_data['in'], 'out': t})

    # Still clocked in
    for person_id, in_data in open_ins.items():
        pk = (person_id, in_data['date'])
        sessions.setdefault(pk, []).append({'in': in_data['in'], 'out': None})

    # ── Build one row per (person, date) ──────────────────────────────────────
    result = []
    for (person_id, date), pairs in sorted(sessions.items()):
        person_info   = people_map.get(person_id, {})
        total_seconds = 0
        first_in      = None
        last_out      = None
        is_ongoing    = False

        for pair in pairs:
            in_t, out_t = pair['in'], pair['out']
            if out_t:
                total_seconds += max(0, int((out_t - in_t).total_seconds()))
                if last_out is None or out_t > last_out:
                    last_out = out_t
            else:
                total_seconds += max(0, int((now - in_t).total_seconds()))
                is_ongoing = True
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