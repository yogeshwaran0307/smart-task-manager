import json, base64, hmac, hashlib, datetime, os, uuid
from .models import ChannelMember
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.contrib.auth import get_user_model
from .models import (
    User, Department, Role, Project, ProjectMember, Task,
    Subtask, Comment, Attachment, ActivityLog,
    Notification, DMMessage, Channel, ChannelMessage, LegacyMessage,
    ExtensionRequest,
)

# Read from environment; fall back to a dev-only default
SECRET = os.environ.get('TOKEN_SECRET', 'smarttask-secret-key-dev-change-in-production')
TOKEN_MAX_AGE_SECONDS = int(os.environ.get('TOKEN_MAX_AGE_SECONDS', str(24 * 3600)))  # 24 h default

# ── TOKEN ──────────────────────────────────────────────────────────────────────
def _make_token(user_id):
    import time
    payload = f"{user_id}:{int(time.time())}"
    sig = hmac.new(SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()[:16]
    return base64.urlsafe_b64encode(f"{payload}:{sig}".encode()).decode()

def _verify_token(token):
    try:
        import time
        raw = base64.urlsafe_b64decode(token.encode()).decode()
        parts = raw.rsplit(':', 1)
        payload, sig = parts[0], parts[1]
        expected = hmac.new(SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()[:16]
        if not hmac.compare_digest(sig, expected):   # constant-time compare
            return None
        uid_str, ts_str = payload.split(':', 1)
        # Enforce token expiry
        if int(time.time()) - int(ts_str) > TOKEN_MAX_AGE_SECONDS:
            return None
        return User.objects.filter(id=int(uid_str), is_active=True).first()
    except Exception:
        return None

def _get_session_user(request):
    token = request.headers.get('Authorization', '').replace('Bearer ', '').strip()
    if not token:
        token = request.COOKIES.get('auth_token', '')
    if not token:
        return None
    return _verify_token(token)

def _json_body(request):
    try:
        return json.loads(request.body or '{}')
    except Exception:
        return {}

# ── ROLE HELPERS ───────────────────────────────────────────────────────────────
RESTRICTED_ROLES = ('junior', 'employee')

def _user_role(user):
    return (user.role or '').lower() if user else ''

def _is_admin(user): return _user_role(user) == 'admin
def _is_manager(user): return _user_role(user) in ('admin', 'manager')
def _is_hod(user): return _user_role(user) == 'head_of_department'

SYSTEM_ROLE_NAMES = {'admin', 'manager', 'head_of_department', 'senior', 'junior', 'employee'}

def _get_role_permissions(user):
    """Return permissions from the user's assigned custom Role (if any)."""
    if not user or not user.role:
        return []
    role_name = user.role.lower()
    if role_name in SYSTEM_ROLE_NAMES:
        return []
    role_obj = Role.objects.filter(name__iexact=role_name).first()
    if role_obj and isinstance(role_obj.permissions, list):
        return role_obj.permissions
    return []

def _get_role_permissions_by_name(role_name):
    """Return permissions for a custom role by name (used before a user object exists)."""
    if not role_name or role_name.lower() in SYSTEM_ROLE_NAMES:
        return []
    role_obj = Role.objects.filter(name__iexact=role_name).first()
    if role_obj and isinstance(role_obj.permissions, list):
        return role_obj.permissions
    return []

def _strip_role_perms(permissions_list, role_name):
    """Remove permissions already granted by a role to keep extra_permissions clean."""
    if not permissions_list:
        return []
    role_perms = set(_get_role_permissions_by_name(role_name))
    return [p for p in permissions_list if p not in role_perms]

def _has_extra_permission(user, perm):
    """Check if user has a specific extra permission granted directly or via their custom Role."""
    if not user:
        return False
    # Check direct extra_permissions on user
    perms = user.extra_permissions or []
    if perm in perms:
        return True
    # Also check permissions inherited from custom Role
    role_perms = _get_role_permissions(user)
    return perm in role_perms

def _can_create(user):
    if not user:
        return False
    role = _user_role(user)
    if role not in RESTRICTED_ROLES:
        return True
    # Allow restricted roles if they have create_projects permission
    return _has_extra_permission(user, 'create_projects')

def _auto_approve(user):
    return user and _user_role(user) in ('admin', 'manager')

def _can_approve(user):
    if not user:
        return False
    if _user_role(user) in ('admin', 'manager', 'head_of_department'):
        return True
    return _has_extra_permission(user, 'approve_tasks')

def _can_view_activity(user):
    if not user:
        return False
    if _user_role(user) in ('admin', 'manager'):
        return True
    return _has_extra_permission(user, 'view_analytics') or _has_extra_permission(user, 'view_activity_log')

def _hod_departments(user):
    if not user:
        return []
    return list(Department.objects.filter(head_user=user).values_list('id', flat=True))

def _hod_effective_depts(user):
    if not user:
        return []
    managed = _hod_departments(user)
    if managed:
        return managed
    if user.department_id:
        return [user.department_id]
    return []

def _can_edit_item(user, item):
    if not user:
        return False
    role = _user_role(user)
    if role in ('admin', 'manager'):
        return True
    if role == 'head_of_department':
        hod_depts = _hod_effective_depts(user)
        if hasattr(item, 'departments'):
            item_depts = list(item.departments.values_list('id', flat=True))
        else:
            item_depts = []
        return not item_depts or any(d in hod_depts for d in item_depts)
    # senior, junior, employee: can edit items they created or are assigned to
    # their changes will go through approval flow
    created_by_id = item.created_by_id if hasattr(item, 'created_by_id') else None
    if created_by_id == user.id:
        return True
    if hasattr(item, 'assignees') and item.assignees.filter(id=user.id).exists():
        return True
    if hasattr(item, 'project_members') and item.project_members.filter(user=user).exists():
        return True
    return False


def _is_item_assignee(user, item):
    if not user:
        return False
    if hasattr(item, 'assignees') and item.assignees.filter(id=user.id).exists():
        return True
    if hasattr(item, 'project_members') and item.project_members.filter(user=user).exists():
        return True
    return False

def _can_access_item(user, item):
    if not user:
        return False
    role = _user_role(user)
    if role in ('admin', 'manager'):
        return True
    # Users with view_all_projects permission can see all projects/tasks
    if _has_extra_permission(user, 'view_all_projects'):
        return True
    if role == 'head_of_department':
        hod_depts = _hod_effective_depts(user)
        if hasattr(item, 'departments'):
            dept_ids = list(item.departments.values_list('id', flat=True))
        else:
            dept_ids = []
        if not dept_ids:
            return True
        return any(d in hod_depts for d in dept_ids)
    if _is_item_assignee(user, item):
        return True
    if role == 'senior':
        if hasattr(item, 'departments'):
            dept_ids = list(item.departments.values_list('id', flat=True))
            if dept_ids and user.department_id and user.department_id in dept_ids:
                return True
    return False

def _is_item_visible(user, item):
    if not user:
        return False
    role = _user_role(user)
    approval_status = item.approval_status
    if approval_status == 'rejected':
        if role in ('admin', 'manager'):
            return True
        if item.created_by_id == user.id:
            return True
        return False
    if approval_status == 'pending':
        if role in ('admin', 'manager'):
            return True
        if item.created_by_id == user.id:
            return True
        if role == 'head_of_department':
            hod_depts = _hod_effective_depts(user)
            if hasattr(item, 'departments'):
                dept_ids = list(item.departments.values_list('id', flat=True))
                if any(d in hod_depts for d in dept_ids):
                    return True
        if _has_extra_permission(user, 'view_all_projects'):
            return True
        return False
    return _can_access_item(user, item)

# ── SERIALIZERS ────────────────────────────────────────────────────────────────
def _serialize_user(u):
    if not u:
        return None
    # Merge direct extra_permissions with permissions from custom role
    direct_perms = u.extra_permissions or []
    role_perms = _get_role_permissions(u)
    merged_perms = list(set(direct_perms) | set(role_perms))
    return {
        'id': u.id,
        'username': u.username,
        'name': u.display_name(),
        'first_name': u.first_name,
        'last_name': u.last_name,
        'email': u.email,
        'role': u.role,
        'department': u.department_id,
        'department_name': u.department.name if u.department else None,
        'phone': u.phone,
        'bio': u.bio,
        'is_active': u.is_active,
        'permissions': merged_perms,
        'direct_permissions': direct_perms,
        'date_joined': u.date_joined.isoformat() if u.date_joined else None,
    }

def _serialize_project(p, include_tasks=False):
    members = []
    for pm in p.project_members.select_related('user').all():
        m = _serialize_user(pm.user)
        m['role_in_project'] = pm.role_in_project
        members.append(m)
    dept_ids = list(p.departments.values_list('id', flat=True))
    tasks = p.tasks.filter(deleted=False)
    total = tasks.count()
    done = tasks.filter(status__in=['done', 'completed']).count()
    progress = int((done / total * 100)) if total > 0 else 0
    data = {
        'id': p.id,
        'name': p.name,
        'project_code': getattr(p, 'project_code', ''),
        'description': p.description,
        'status': p.status,
        'priority': p.priority,
        'due_date': str(p.due_date) if p.due_date else None,
        'eta': p.eta or '',
        'approval_status': p.approval_status,
        'rejection_reason': p.rejection_reason,
        'created_by': p.created_by_id,
        'approved_by': p.approved_by_id,
        'department_ids': dept_ids,
        'members': members,
        'deleted': p.deleted,
        'deleted_at': p.deleted_at.timestamp() if p.deleted_at else None,
        'created_at': p.created_at.timestamp() if p.created_at else None,
        'pending_changes': p.pending_changes,
        'edit_approval_status': p.edit_approval_status,
        'edit_requested_by': p.edit_requested_by_id,
        'is_overdue': _is_overdue(p),
        'progress_percentage': progress,
        'total_tasks': total,
        'completed_tasks': done,
    }
    return data

def _serialize_task(t):
    assignees = [_serialize_user(u) for u in t.assignees.all()]
    dept_ids = list(t.departments.values_list('id', flat=True))
    assignee_ids = [u['id'] for u in assignees]
    project_info = None
    if t.project:
        project_info = {
            'id': t.project.id,
            'name': t.project.name,
            'project_code': getattr(t.project, 'project_code', ''),
        }
    return {
        'id': t.id,
        'title': t.title,
        'task_code': getattr(t, 'task_code', ''),
        'description': t.description,
        'status': t.status,
        'priority': t.priority,
        'due_date': str(t.due_date) if t.due_date else None,
        'eta': t.eta or '',
        'project': t.project_id,
        'project_info': project_info,
        'assignees': assignees,
        'assignee_ids': assignee_ids,
        'assigned_to': assignee_ids[0] if assignee_ids else None,
        'department_ids': dept_ids,
        'created_by': t.created_by_id,
        'approved_by': t.approved_by_id,
        'approval_status': t.approval_status,
        'rejection_reason': t.rejection_reason,
        'deleted': t.deleted,
        'deleted_at': t.deleted_at.timestamp() if t.deleted_at else None,
        'created_at': t.created_at.timestamp() if t.created_at else None,
        'completed_at': t.completed_at.timestamp() if t.completed_at else None,
        'pending_changes': t.pending_changes,
        'edit_approval_status': t.edit_approval_status,
        'edit_requested_by': t.edit_requested_by_id,
        'is_overdue': _is_overdue(t),
    }

def _add_notification(user_id, message, ntype='info', related_id=None, related_type=None):
    try:
        Notification.objects.create(
            user_id=user_id, message=message, type=ntype,
            related_id=related_id, related_type=related_type or ''
        )
    except Exception:
        pass

def _add_activity(action, user=None):
    ActivityLog.objects.create(
        action=action,
        user=user,
        user_name=user.display_name() if user else 'System'
    )

def _is_overdue(item):
    if not item.due_date:
        return False

    due = item.due_date

    if isinstance(due, str):
        try:
            due = datetime.datetime.strptime(due, "%Y-%m-%d").date()
        except ValueError:
            return False

    return due < datetime.date.today()

def _get_dept_heads_for_depts(dept_queryset):
    return list(
        Department.objects.filter(id__in=dept_queryset, head_user__isnull=False)
        .values_list('head_user_id', flat=True)
    )

def _check_due_date_reminders():
    today = datetime.date.today()
    for t in Task.objects.filter(deleted=False, due_date__isnull=False):
        try:
            days_left = (t.due_date - today).days
            if 0 <= days_left <= 2:
                if Notification.objects.filter(
                    message__contains=f"Task '{t.title}'",
                    type='reminder',
                    related_id=t.id
                ).exists():
                    continue
                for uid in list(t.assignees.values_list('id', flat=True)):
                    msg = f"⏰ Reminder: Task '{t.title}' is due {'today' if days_left == 0 else f'in {days_left} day(s)'}!"
                    _add_notification(uid, msg, ntype='reminder', related_id=t.id, related_type='task')
        except Exception:
            pass

# ── AUTH ────────────────────────────────────────────────────────────────────────
@csrf_exempt
def login_view(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    body = _json_body(request)
    username = body.get('username', '').strip()
    password = body.get('password', '').strip()
    user = User.objects.filter(username=username, is_active=True).first()
    if not user or user.username != username or not user.check_password(password):
       return JsonResponse({'error': 'Invalid credentials'}, status=400)
    token = _make_token(user.id)
    _add_activity(f"{user.display_name()} logged in", user)
    resp = JsonResponse({'token': token, 'user': _serialize_user(user)})
    resp.set_cookie('auth_token', token, httponly=False, samesite='Lax', max_age=86400 * 7)
    return resp

@csrf_exempt
def logout_view(request):
    resp = JsonResponse({'success': True})
    resp.delete_cookie('auth_token')
    return resp

@csrf_exempt
def profile_view(request):
    user = _get_session_user(request)
    if not user:
        return JsonResponse({'error': 'Unauthenticated'}, status=401)
    if request.method == 'GET':
        return JsonResponse(_serialize_user(user))
    if request.method == 'PATCH':
        body = _json_body(request)
        for k in ('name', 'email', 'first_name', 'last_name', 'phone', 'bio'):
            if k in body:
                setattr(user, k, body[k])
        user.save()
        return JsonResponse(_serialize_user(user))
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
def change_password_view(request):
    user = _get_session_user(request)
    if not user:
        return JsonResponse({'error': 'Unauthenticated'}, status=401)
    body = _json_body(request)
    if not user.check_password(body.get('old_password', '')):
        return JsonResponse({'error': 'Old password is incorrect'}, status=400)
    new_pw = body.get('new_password', '')
    if len(new_pw) < 4:
        return JsonResponse({'error': 'New password too short'}, status=400)
    user.set_password(new_pw)
    user.save()
    return JsonResponse({'success': True})

@csrf_exempt
def csrf_view(request):
    return JsonResponse({'detail': 'CSRF not required'})

# ── NOTIFICATIONS ───────────────────────────────────────────────────────────────
@csrf_exempt
def notifications_view(request):
    user = _get_session_user(request)
    if not user:
        return JsonResponse([], safe=False)
    _check_due_date_reminders()
    notifs = Notification.objects.filter(user=user).order_by('-created_at')[:50]
    data = [{
        'id': n.id, 'message': n.message, 'type': n.type,
        'read': n.read, 'related_id': n.related_id,
        'related_type': n.related_type,
        'created_at': n.created_at.timestamp()
    } for n in notifs]
    return JsonResponse(data, safe=False)

@csrf_exempt
def notification_read(request, id):
    Notification.objects.filter(id=id).update(read=True)
    return JsonResponse({'success': True})

@csrf_exempt
def notifications_read_all(request):
    user = _get_session_user(request)
    if user:
        Notification.objects.filter(user=user).update(read=True)
    return JsonResponse({'success': True})

# ── APPROVALS ───────────────────────────────────────────────────────────────────
@csrf_exempt
def approvals_list(request):
    user = _get_session_user(request)
    if not user or not _can_approve(user):
        return JsonResponse({'error': 'Unauthorized'}, status=403)
    role = _user_role(user)
    result = []
    seen_task_ids = set()
    seen_project_ids = set()
    from django.db.models import Q
    tasks_qs = Task.objects.filter(
        deleted=False
    ).filter(
        Q(approval_status='pending') | Q(edit_approval_status='pending')
    ).prefetch_related('assignees', 'departments')
    projects_qs = Project.objects.filter(
        deleted=False
    ).filter(
        Q(approval_status='pending') | Q(edit_approval_status='pending')
    ).prefetch_related('departments', 'project_members__user')
    # Admin, manager, or users with approve_tasks permission see all
    is_full_approver = role in ('admin', 'manager') or _has_extra_permission(user, 'approve_tasks')

    def _expand_pending_changes(base_dict, item, item_type):
        """If pending_changes is a list (queue), emit one entry per change request.
        Otherwise emit one entry (backward-compat with old single-dict format)."""
        pending = item.pending_changes
        is_edit_pending = item.edit_approval_status == 'pending'
        if is_edit_pending and isinstance(pending, list) and len(pending) > 0:
            entries = []
            for idx, cr in enumerate(pending):
                d = dict(base_dict)
                d['item_type'] = item_type
                d['pending_changes'] = cr.get('changes', {})
                d['change_request_id'] = cr.get('change_request_id', 'legacy')
                d['change_submitted_by_name'] = cr.get('submitted_by_name', '')
                d['change_submitted_at'] = cr.get('submitted_at', '')
                d['change_queue_position'] = idx + 1
                d['total_change_requests'] = len(pending)
                entries.append(d)
            return entries
        else:
            base_dict['item_type'] = item_type
            return [base_dict]

    for t in tasks_qs:
        if t.id in seen_task_ids:
            continue
        if is_full_approver:
            d = _serialize_task(t)
            result.extend(_expand_pending_changes(d, t, 'task'))
            seen_task_ids.add(t.id)
        elif role == 'head_of_department':
            hod_depts = _hod_effective_depts(user)
            item_depts = list(t.departments.values_list('id', flat=True))
            if any(d in hod_depts for d in item_depts):
                d = _serialize_task(t)
                result.extend(_expand_pending_changes(d, t, 'task'))
                seen_task_ids.add(t.id)
    for p in projects_qs:
        if p.id in seen_project_ids:
            continue
        if is_full_approver:
            d = _serialize_project(p)
            result.extend(_expand_pending_changes(d, p, 'project'))
            seen_project_ids.add(p.id)
        elif role == 'head_of_department':
            hod_depts = _hod_effective_depts(user)
            item_depts = list(p.departments.values_list('id', flat=True))
            if any(d in hod_depts for d in item_depts):
                d = _serialize_project(p)
                result.extend(_expand_pending_changes(d, p, 'project'))
                seen_project_ids.add(p.id)
    return JsonResponse(result, safe=False)

# ── PROJECTS ────────────────────────────────────────────────────────────────────
@csrf_exempt
def projects_list(request):
    user = _get_session_user(request)
    if not user:
        return JsonResponse({'error': 'Unauthenticated'}, status=401)
    if request.method == 'GET':
        search = (request.GET.get('search') or '').lower().strip()
        status_f = (request.GET.get('status') or '').lower().strip()
        priority_f = (request.GET.get('priority') or '').lower().strip()
        qs = Project.objects.filter(deleted=False).prefetch_related('departments', 'project_members__user')
        result = []
        for p in qs:
            if not _is_item_visible(user, p):
                continue
            if search and search not in p.name.lower() and search not in p.description.lower():
                continue
            if status_f and (p.status or '').lower() != status_f:
                continue
            if priority_f and (p.priority or '').lower() != priority_f:
                continue
            result.append(_serialize_project(p))
        return JsonResponse(result, safe=False)
    if request.method == 'POST':
        if not user:
            return JsonResponse({'error': 'Unauthenticated'}, status=401)
        if not _can_create(user):
            return JsonResponse({'error': 'You do not have permission to create projects.'}, status=403)
        body = _json_body(request)
        auto = _auto_approve(user)
        dept_ids = [int(d) for d in (body.get('department_ids') or []) if d]
        if _is_hod(user):
            hod_depts = _hod_effective_depts(user)
            if not dept_ids:
                dept_ids = hod_depts
            elif not all(d in hod_depts for d in dept_ids):
                return JsonResponse({'error': 'As HOD, you can only create projects for your department(s).'}, status=403)
        due_date = body.get('due_date') or None
        if not due_date:
            return JsonResponse({'error': 'Due date is required for all projects.'}, status=400)
        eta = (body.get('eta') or '').strip()
        if not eta:
            return JsonResponse({'error': 'ETA (Estimated Time to Complete) is required for all projects.'}, status=400)
        p = Project.objects.create(
            name=body.get('name', ''),
            description=body.get('description', ''),
            status=body.get('status', 'active'),
            priority=body.get('priority', ''),
            due_date=due_date,
            eta=eta,
            created_by=user,
            approval_status='approved' if auto else 'pending',
        )
        if dept_ids:
            p.departments.set(dept_ids)
        # Save project members
        member_data = body.get('members') or []
        member_ids = []
        for m in member_data:
            try:
                mid = int(m['id'] if isinstance(m, dict) else m)
                member_ids.append(mid)
            except Exception:
                pass
        for mid in member_ids:
            u_member = User.objects.filter(id=mid).first()
            if u_member:
                ProjectMember.objects.get_or_create(project=p, user=u_member)
        _add_activity(f"Project '{p.name}' created by {user.display_name()}", user)
        if not auto:
            for u in User.objects.filter(role__in=['admin', 'manager'], is_active=True):
                _add_notification(u.id, f"🆕 Project '{p.name}' requires your approval (by {user.display_name()})",
                                  ntype='approval', related_id=p.id, related_type='project')
        return JsonResponse(_serialize_project(p), status=201)
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
def project_detail(request, id):
    p = Project.objects.filter(id=id).prefetch_related('departments', 'project_members__user').first()
    if not p:
        return JsonResponse({'error': 'Not found'}, status=404)
    if request.method == 'GET':
        user = _get_session_user(request)
        if not _is_item_visible(user, p):
            return JsonResponse({'error': 'Access denied'}, status=403)
        return JsonResponse(_serialize_project(p))
    if request.method in ('PATCH', 'PUT'):
        user = _get_session_user(request)
        if not user:
            return JsonResponse({'error': 'Unauthenticated'}, status=401)
        if _is_overdue(p):
            return JsonResponse({'error': 'This project has passed its due date and is locked. No changes are allowed.'}, status=403)
        if not _can_edit_item(user, p):
            return JsonResponse({'error': 'You do not have permission to edit this project.'}, status=403)
        body = _json_body(request)
        if _auto_approve(user):
            for k in ('name', 'description', 'status', 'priority', 'due_date', 'eta'):
                if k in body:
                    setattr(p, k, body[k] or None if k == 'due_date' else body[k])
            if 'department_ids' in body:
                dept_ids = [int(d) for d in body['department_ids'] if d]
                p.departments.set(dept_ids)
            if 'members' in body:
                member_ids = []
                for m in (body['members'] or []):
                    try:
                        mid = int(m['id'] if isinstance(m, dict) else m)
                        member_ids.append(mid)
                    except Exception:
                        pass
                ProjectMember.objects.filter(project=p).delete()
                for mid in member_ids:
                    u_member = User.objects.filter(id=mid).first()
                    if u_member:
                        ProjectMember.objects.get_or_create(project=p, user=u_member)
            p.save()
            _add_activity(f"Project '{p.name}' updated by {user.display_name()}", user)
        else:
            # Only store fields that were actually provided and non-empty
            # This prevents wiping departments/members when a non-manager edits
            safe_changes = {k: v for k, v in body.items() if v is not None and v != '' and v != [] }
            # Build a change-request entry and append to the queue (supports multiple pending requests)
            change_req = {
                'change_request_id': uuid.uuid4().hex[:12],
                'changes': safe_changes,
                'submitted_by_id': user.id,
                'submitted_by_name': user.display_name(),
                'submitted_at': str(timezone.now()),
            }
            existing_pending = p.pending_changes
            if isinstance(existing_pending, list):
                existing_pending.append(change_req)
            elif isinstance(existing_pending, dict):
                existing_pending = [{'change_request_id': 'legacy', 'changes': existing_pending,
                                     'submitted_by_name': 'Previous request', 'submitted_at': ''}, change_req]
            else:
                existing_pending = [change_req]
            p.pending_changes = existing_pending
            p.edit_approval_status = 'pending'
            p.edit_requested_by = user
            p.save()
            _add_activity(f"Project '{p.name}' edit submitted for approval by {user.display_name()}", user)
            for u in User.objects.filter(role__in=['admin', 'manager'], is_active=True):
                _add_notification(u.id, f"✏️ Project '{p.name}' edit requires approval",
                                  ntype='approval', related_id=p.id, related_type='project')
        return JsonResponse(_serialize_project(p))
    if request.method == 'DELETE':
        user = _get_session_user(request)
        if not user:
            return JsonResponse({'error': 'Unauthenticated'}, status=401)
        if not _is_manager(user):
            return JsonResponse({'error': 'Only Admins and Managers can delete projects.'}, status=403)
        if _is_overdue(p):
            return JsonResponse({'error': 'This project has passed its due date and is locked. No changes are allowed.'}, status=403)
        p.deleted = True
        p.deleted_at = timezone.now()
        p.save()
        _add_activity(f"Project '{p.name}' moved to recycle bin by {user.display_name()}", user)
        return JsonResponse({'success': True})
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
def project_submit_approval(request, id):
    p = Project.objects.filter(id=id).first()
    if not p:
        return JsonResponse({'error': 'Not found'}, status=404)
    p.approval_status = 'pending'
    p.save()
    user = _get_session_user(request)
    name = user.display_name() if user else 'Someone'
    for u in User.objects.filter(role__in=['admin', 'manager'], is_active=True):
        _add_notification(u.id, f"🆕 Project '{p.name}' submitted for approval by {name}",
                          ntype='approval', related_id=p.id, related_type='project')
    return JsonResponse({'success': True})

@csrf_exempt
def project_approve(request, id):
    p = Project.objects.filter(id=id).prefetch_related('departments').first()
    if not p:
        return JsonResponse({'error': 'Not found'}, status=404)
    user = _get_session_user(request)
    if not user or not _can_approve(user):
        return JsonResponse({'error': 'Unauthorized'}, status=403)
    # HOD can only approve projects belonging to their own department(s)
    if _is_hod(user):
        hod_depts = _hod_effective_depts(user)
        item_depts = list(p.departments.values_list('id', flat=True))
        if not any(d in hod_depts for d in item_depts):
            return JsonResponse({'error': 'You can only approve projects for your own department.'}, status=403)
    body = _json_body(request) or {}
    change_request_id = body.get('change_request_id')

    def _apply_project_changes(changes):
        for k in ('name', 'description', 'status', 'priority', 'due_date', 'eta'):
            if k in changes:
                setattr(p, k, changes[k] or None if k == 'due_date' else changes[k])
        if 'department_ids' in changes:
            dept_ids = [int(d) for d in changes['department_ids'] if d]
            p.departments.set(dept_ids)
        if 'members' in changes:
            member_ids = []
            for m in (changes['members'] or []):
                try:
                    mid = int(m['id'] if isinstance(m, dict) else m)
                    member_ids.append(mid)
                except Exception:
                    pass
            ProjectMember.objects.filter(project=p).delete()
            for mid in member_ids:
                u_member = User.objects.filter(id=mid).first()
                if u_member:
                    ProjectMember.objects.get_or_create(project=p, user=u_member)

    if p.pending_changes:
        if isinstance(p.pending_changes, list) and change_request_id:
            # Apply only the specific change request from the queue
            pending_list = p.pending_changes
            req_to_apply = next((r for r in pending_list if r.get('change_request_id') == change_request_id), None)
            if req_to_apply:
                _apply_project_changes(req_to_apply.get('changes', {}))
                remaining = [r for r in pending_list if r.get('change_request_id') != change_request_id]
                p.pending_changes = remaining if remaining else None
                if not remaining:
                    p.edit_approval_status = ''
                    p.edit_requested_by = None
        else:
            # Legacy single-dict format or no ID provided — apply all
            changes = p.pending_changes if isinstance(p.pending_changes, dict) else {}
            _apply_project_changes(changes)
            p.pending_changes = None
            p.edit_approval_status = ''
            p.edit_requested_by = None
    # Simpler: if it was already approved, this is an edit request
    was_approved = (p.approval_status == 'approved')
    if not was_approved:
        p.approval_status = 'approved'
    p.approved_by = user
    p.save()
    action = "edit approved" if was_approved else "approved"
    _add_activity(f"Project '{p.name}' {action} by {user.display_name()}", user)
    if p.created_by:
        if was_approved:
            _add_notification(p.created_by_id, f"✅ Your edit for project '{p.name}' was approved by {user.display_name()}",
                              ntype='approval', related_id=p.id, related_type='project')
        else:
            _add_notification(p.created_by_id, f"✅ Your project '{p.name}' has been approved by {user.display_name()}",
                              ntype='approval', related_id=p.id, related_type='project')
    return JsonResponse({'success': True})

@csrf_exempt
def project_reject(request, id):
    p = Project.objects.filter(id=id).prefetch_related('departments').first()
    if not p:
        return JsonResponse({'error': 'Not found'}, status=404)
    user = _get_session_user(request)
    if not user or not _can_approve(user):
        return JsonResponse({'error': 'Unauthorized'}, status=403)
    # HOD can only reject projects belonging to their own department(s)
    if _is_hod(user):
        hod_depts = _hod_effective_depts(user)
        item_depts = list(p.departments.values_list('id', flat=True))
        if not any(d in hod_depts for d in item_depts):
            return JsonResponse({'error': 'You can only reject projects for your own department.'}, status=403)
    body = _json_body(request)
    reason = body.get('reason', '')
    change_request_id = body.get('change_request_id')
    is_edit_request = bool(p.edit_approval_status == 'pending' and p.approval_status == 'approved')
    if is_edit_request:
        # Reject only the specific change request from the queue
        if isinstance(p.pending_changes, list) and change_request_id:
            remaining = [r for r in p.pending_changes if r.get('change_request_id') != change_request_id]
            p.pending_changes = remaining if remaining else None
            if not remaining:
                p.edit_approval_status = 'rejected'
                p.edit_requested_by = None
            # else queue still has more entries, keep edit_approval_status = 'pending'
        else:
            # Legacy: clear all pending changes
            p.pending_changes = None
            p.edit_approval_status = 'rejected'
        p.save()
        _add_activity(f"Project '{p.name}' edit request rejected by {user.display_name()}", user)
        if p.edit_requested_by_id:
            _add_notification(p.edit_requested_by_id,
                              f"❌ Your edit request for project '{p.name}' was rejected" + (f": {reason}" if reason else ""),
                              ntype='approval', related_id=p.id, related_type='project')
    else:
        p.approval_status = 'rejected'
        p.rejection_reason = reason
        p.pending_changes = None
        p.edit_approval_status = ''
        p.save()
        _add_activity(f"Project '{p.name}' rejected by {user.display_name()}", user)
        if p.created_by:
            _add_notification(p.created_by_id,
                              f"❌ Your project '{p.name}' was rejected" + (f": {reason}" if reason else ""),
                              ntype='approval', related_id=p.id, related_type='project')
    return JsonResponse({'success': True})

@csrf_exempt
def project_kanban(request, id):
    p = Project.objects.filter(id=id).first()
    if not p:
        return JsonResponse({'error': 'Not found'}, status=404)
    user = _get_session_user(request)
    tasks_qs = Task.objects.filter(project=p, deleted=False).prefetch_related('assignees', 'departments')
    if user and _user_role(user) not in ('admin', 'manager'):
        tasks_qs = [t for t in tasks_qs if _is_item_visible(user, t)]
    tasks_data = [_serialize_task(t) for t in tasks_qs]
    return JsonResponse({'project': _serialize_project(p), 'tasks': tasks_data})

@csrf_exempt
def project_recycle_bin(request):
    user = _get_session_user(request)
    can_access = user and (_is_manager(user) or _has_extra_permission(user, 'manage_recycle_bin'))
    if not can_access:
        return JsonResponse({'projects': [], 'tasks': []})
    deleted_projects = [_serialize_project(p) for p in Project.objects.filter(deleted=True).prefetch_related('departments', 'project_members__user')]
    deleted_tasks = [_serialize_task(t) for t in Task.objects.filter(deleted=True).prefetch_related('assignees', 'departments')]
    return JsonResponse({'projects': deleted_projects, 'tasks': deleted_tasks})

@csrf_exempt
def project_restore(request, id):
    user = _get_session_user(request)
    can_access = user and (_is_manager(user) or _has_extra_permission(user, 'manage_recycle_bin'))
    if not can_access:
        return JsonResponse({'error': 'Permission denied'}, status=403)
    p = Project.objects.filter(id=id).first()
    if p:
        p.deleted = False
        p.deleted_at = None
        p.save()
        _add_activity(f"Project '{p.name}' restored by {user.display_name()}", user)
    return JsonResponse({'success': True})

@csrf_exempt
def project_purge(request, id):
    user = _get_session_user(request)
    if not user or not (_is_admin(user) or _has_extra_permission(user, 'purge_items')):
        return JsonResponse({'error': 'Permission denied'}, status=403)
    p = Project.objects.filter(id=id).first()
    if p:
        _add_activity(f"Project '{p.name}' permanently deleted by {user.display_name()}", user)
        p.delete()
    return JsonResponse({'success': True})

@csrf_exempt
def project_analytics(request):
    user = _get_session_user(request)
    if not user:
        return JsonResponse({'error': 'Unauthenticated'}, status=401)
    role = _user_role(user)
    if role in ('admin', 'manager') or _has_extra_permission(user, 'view_analytics'):
        visible_projects = list(Project.objects.filter(deleted=False, approval_status='approved'))
        visible_tasks = list(Task.objects.filter(deleted=False, approval_status='approved'))
        # Weekly counts include ALL non-deleted tasks (any approval status)
        weekly_task_ids = set(Task.objects.filter(deleted=False).values_list('id', flat=True))
    elif role == 'head_of_department':
        hod_depts = _hod_effective_depts(user)
        visible_projects = [p for p in Project.objects.filter(deleted=False, approval_status='approved').prefetch_related('departments')
                            if any(d in hod_depts for d in p.departments.values_list('id', flat=True))]
        visible_tasks = [t for t in Task.objects.filter(deleted=False, approval_status='approved').prefetch_related('departments')
                         if any(d in hod_depts for d in t.departments.values_list('id', flat=True))]
        # Weekly counts include all department tasks regardless of approval status
        weekly_task_ids = set(
            Task.objects.filter(deleted=False, departments__in=hod_depts).values_list('id', flat=True)
        )
    else:
        visible_tasks = [t for t in Task.objects.filter(deleted=False, approval_status='approved').prefetch_related('assignees', 'departments')
                         if _is_item_visible(user, t)]
        visible_projects = [p for p in Project.objects.filter(deleted=False, approval_status='approved').prefetch_related('departments', 'project_members')
                            if _is_item_visible(user, p)]
        # Weekly counts include tasks assigned to or created by this user (any approval status)
        assigned_ids = set(Task.objects.filter(deleted=False, assignees=user).values_list('id', flat=True))
        created_ids = set(Task.objects.filter(deleted=False, created_by=user).values_list('id', flat=True))
        weekly_task_ids = assigned_ids | created_ids
    completed_tasks = [t for t in visible_tasks if t.status in ('done', 'completed')]
    in_progress = [t for t in visible_tasks if t.status == 'in_progress']
    pending = [t for t in visible_tasks if t.status in ('pending', 'todo')]
    scope_label = 'Company-wide' if role in ('admin', 'manager') else ('Department' if role == 'head_of_department' else 'Your Assignments')

    # ── Weekly Task Activity: rolling last-7-days window ────────────────────────
    # Uses last 7 days (today inclusive) so the chart always shows recent activity.
    #
    # IMPORTANT: We intentionally avoid Django's __date__ lookup here.
    # With MySQL + USE_TZ=True, __date__ generates CONVERT_TZ() in SQL which
    # requires the MySQL timezone tables to be populated (mysql_tzinfo_to_sql).
    # On most dev/production setups these tables are empty, so CONVERT_TZ()
    # returns NULL and every date comparison fails → chart always shows zeros.
    #
    # Fix: convert boundary dates to timezone-aware datetimes and use __gte/__lte
    # which translates to a plain UTC range comparison — works on all MySQL setups.
    today = timezone.localdate()
    last7_start = today - datetime.timedelta(days=6)   # 6 days ago → 7 days total

    # Timezone-aware datetimes for the window boundaries (stored as UTC in MySQL)
    window_start_dt = timezone.make_aware(
        datetime.datetime.combine(last7_start, datetime.time.min)
    )
    window_end_dt = timezone.make_aware(
        datetime.datetime.combine(today, datetime.time.max)
    )

    # Build ordered list of the 7 dates
    day_entries = []
    for offset in range(7):
        d = last7_start + datetime.timedelta(days=offset)
        day_entries.append({
            'date_obj': d,
            'label': d.strftime('%a'),      # Mon / Tue / … / Sun
            'date': d.strftime('%b %d'),    # May 25
            'created': 0,
            'completed': 0,
        })
    date_index = {e['date_obj']: i for i, e in enumerate(day_entries)}

    def _local_date(ts):
        """Convert a DB timestamp to the local calendar date."""
        if ts is None:
            return None
        return timezone.localtime(ts).date() if timezone.is_aware(ts) else ts.date()

    # Tasks created in the last 7 days
    created_qs = Task.objects.filter(
        id__in=weekly_task_ids,
        created_at__gte=window_start_dt,
        created_at__lte=window_end_dt,
    ).values_list('created_at', flat=True)
    for ts in created_qs:
        d = _local_date(ts)
        if d in date_index:
            day_entries[date_index[d]]['created'] += 1

    # Tasks completed in the last 7 days (accurate completed_at)
    completed_qs = Task.objects.filter(
        id__in=weekly_task_ids,
        status__in=('done', 'completed'),
        completed_at__gte=window_start_dt,
        completed_at__lte=window_end_dt,
    ).values_list('completed_at', flat=True)
    for ts in completed_qs:
        d = _local_date(ts)
        if d in date_index:
            day_entries[date_index[d]]['completed'] += 1

    # Fallback: tasks marked done/completed but missing completed_at
    # (tasks completed before the completed_at migration was applied).
    # Use created_at as a best-effort proxy for when they were completed.
    fallback_qs = Task.objects.filter(
        id__in=weekly_task_ids,
        status__in=('done', 'completed'),
        completed_at__isnull=True,
        created_at__gte=window_start_dt,
        created_at__lte=window_end_dt,
    ).values_list('created_at', flat=True)
    for ts in fallback_qs:
        d = _local_date(ts)
        if d in date_index:
            day_entries[date_index[d]]['completed'] += 1

    weekly_tasks = [
        {
            'day': e['label'],
            'created': e['created'],
            'completed': e['completed'],
            'date': e['date'],
        }
        for e in day_entries
    ]
    # ── End weekly activity ────────────────────────────────────────────────────

    overdue_tasks = len([t for t in visible_tasks if _is_overdue(t)])
    tasks_created_this_week = sum(d['created'] for d in weekly_tasks)

    return JsonResponse({
        'scope': scope_label,
        'stats': {
            'total_projects': len(visible_projects),
            'active_projects': len([p for p in visible_projects if (p.status or '').lower() == 'active']),
            'completed_projects': len([p for p in visible_projects if (p.status or '').lower() == 'completed']),
            'total_tasks': len(visible_tasks),
            'completed_tasks': len(completed_tasks),
            'in_progress_tasks': len(in_progress),
            'pending_tasks': len(pending),
            'overdue_tasks': overdue_tasks,
            'tasks_this_week': tasks_created_this_week,
        },
        'charts': {
            'status_distribution': [
                {'name': 'Pending', 'value': len(pending)},
                {'name': 'In Progress', 'value': len(in_progress)},
                {'name': 'Done', 'value': len(completed_tasks)},
            ],
            'weekly_tasks': weekly_tasks,
            'team_performance': [],
            'monthly_trend': [],
        }
    })

@csrf_exempt
def project_members(request, id):
    user = _get_session_user(request)
    p = Project.objects.filter(id=id).first()
    if not p:
        return JsonResponse({'error': 'Not found'}, status=404)
    if request.method == 'POST':
        # Only admin, manager, or users with manage_members permission can add members
        if not user:
            return JsonResponse({'error': 'Unauthenticated'}, status=401)
        if not (_is_manager(user) or _has_extra_permission(user, 'manage_members')):
            return JsonResponse({'error': 'You do not have permission to manage members.'}, status=403)
        body = _json_body(request)
        user_id = body.get('id') or body.get('user_id')
        if user_id:
            u = User.objects.filter(id=user_id).first()
            if u:
                ProjectMember.objects.get_or_create(project=p, user=u)
        return JsonResponse({'success': True})
    members = []
    for pm in p.project_members.select_related('user__department').all():
        m = _serialize_user(pm.user)
        m['role_in_project'] = pm.role_in_project
        members.append(m)
    return JsonResponse(members, safe=False)

@csrf_exempt
def project_member_detail(request, id, user_id):
    requesting_user = _get_session_user(request)
    p = Project.objects.filter(id=id).first()
    if not p:
        return JsonResponse({'error': 'Not found'}, status=404)
    if not requesting_user:
        return JsonResponse({'error': 'Unauthenticated'}, status=401)
    if not (_is_manager(requesting_user) or _has_extra_permission(requesting_user, 'manage_members')):
        return JsonResponse({'error': 'Permission denied'}, status=403)
    if request.method == 'DELETE':
        ProjectMember.objects.filter(project=p, user_id=user_id).delete()
    if request.method == 'PATCH':
        body = _json_body(request)
        pm = ProjectMember.objects.filter(project=p, user_id=user_id).first()
        if pm and 'role_in_project' in body:
            pm.role_in_project = body['role_in_project']
            pm.save()
    return JsonResponse({'success': True})

# ── TASKS ────────────────────────────────────────────────────────────────────────
def _apply_task_body(t, body):
    from django.utils import timezone as tz
    new_status = body.get('status')
    for k in ('title', 'description', 'status', 'priority', 'eta'):
        if k in body:
            setattr(t, k, body[k])
    if 'due_date' in body:
        t.due_date = body['due_date'] or None
    if 'project' in body:
        t.project_id = body['project']
    # Track when a task is first marked as done/completed
    if new_status in ('done', 'completed') and not t.completed_at:
        t.completed_at = tz.now()
    elif new_status and new_status not in ('done', 'completed'):
        # Reset if moved back out of completed state
        t.completed_at = None
    t.save()
    if 'assignee_ids' in body:
        ids = []
        for x in (body['assignee_ids'] or []):
            try:
                ids.append(int(x['id'] if isinstance(x, dict) else x))
            except Exception:
                pass
        t.assignees.set(ids)
    elif 'assigned_to' in body and body['assigned_to']:
        try:
            t.assignees.set([int(body['assigned_to'])])
        except Exception:
            pass
    if 'department_ids' in body:
        dept_ids = [int(d) for d in (body['department_ids'] or []) if d]
        t.departments.set(dept_ids)

@csrf_exempt
def tasks_list(request):
    user = _get_session_user(request)
    if not user:
        return JsonResponse({'error': 'Unauthenticated'}, status=401)
    if request.method == 'GET':
        search = (request.GET.get('search') or '').lower().strip()
        status_f = (request.GET.get('status') or '').lower().strip()
        priority_f = (request.GET.get('priority') or '').lower().strip()
        qs = Task.objects.filter(deleted=False).prefetch_related('assignees', 'departments')
        result = []
        for t in qs:
            if not _is_item_visible(user, t):
                continue
            if search and search not in t.title.lower() and search not in t.description.lower():
                continue
            if status_f and (t.status or '').lower() != status_f:
                continue
            if priority_f and (t.priority or '').lower() != priority_f:
                continue
            result.append(_serialize_task(t))
        return JsonResponse(result, safe=False)
    if request.method == 'POST':
        if not user:
            return JsonResponse({'error': 'Unauthenticated'}, status=401)
        if not _can_create(user):
            return JsonResponse({'error': 'You do not have permission to create tasks.'}, status=403)
        body = _json_body(request)
        dept_ids = [int(d) for d in (body.get('department_ids') or []) if d]
        if _is_hod(user):
            hod_depts = _hod_effective_depts(user)
            if not dept_ids:
                dept_ids = hod_depts
            elif not all(d in hod_depts for d in dept_ids):
                return JsonResponse({'error': 'As HOD, you can only create tasks for your department(s).'}, status=403)
        auto = _auto_approve(user)
        task_due_date = body.get('due_date') or None
        if not task_due_date:
            return JsonResponse({'error': 'Due date is required for all tasks.'}, status=400)
        task_eta = (body.get('eta') or '').strip()
        if not task_eta:
            return JsonResponse({'error': 'ETA (Estimated Time to Complete) is required for all tasks.'}, status=400)
        t = Task.objects.create(
            title=body.get('title', ''),
            description=body.get('description', ''),
            status=body.get('status', 'pending'),
            priority=body.get('priority', ''),
            due_date=task_due_date,
            eta=task_eta,
            project_id=body.get('project') or None,
            created_by=user,
            approval_status='approved' if auto else 'pending',
        )
        if dept_ids:
            t.departments.set(dept_ids)
        assignee_ids = []
        for x in (body.get('assignee_ids') or []):
            try:
                assignee_ids.append(int(x['id'] if isinstance(x, dict) else x))
            except Exception:
                pass
        if not assignee_ids and body.get('assigned_to'):
            try:
                assignee_ids = [int(body['assigned_to'])]
            except Exception:
                pass
        if assignee_ids:
            t.assignees.set(assignee_ids)
        _add_activity(f"Task '{t.title}' created by {user.display_name()}", user)
        if not auto:
            for u in User.objects.filter(role__in=['admin', 'manager'], is_active=True):
                _add_notification(u.id, f"🆕 Task '{t.title}' requires your approval (by {user.display_name()})",
                                  ntype='approval', related_id=t.id, related_type='task')
        else:
            for uid in assignee_ids:
                if uid != user.id:
                    _add_notification(uid, f"📋 You have been assigned task: '{t.title}' by {user.display_name()}",
                                      ntype='task', related_id=t.id, related_type='task')
        return JsonResponse(_serialize_task(t), status=201)
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
def my_tasks(request):
    user = _get_session_user(request)
    if not user:
        return JsonResponse([], safe=False)
    search = (request.GET.get('search') or '').lower().strip()
    status_f = (request.GET.get('status') or '').lower().strip()
    priority_f = (request.GET.get('priority') or '').lower().strip()
    qs = Task.objects.filter(deleted=False, assignees=user).exclude(approval_status='rejected').prefetch_related('assignees', 'departments')
    result = []
    for t in qs:
        if search and search not in t.title.lower() and search not in t.description.lower():
            continue
        if status_f and (t.status or '').lower() != status_f:
            continue
        if priority_f and (t.priority or '').lower() != priority_f:
            continue
        result.append(_serialize_task(t))
    return JsonResponse(result, safe=False)

@csrf_exempt
def department_tasks(request):
    user = _get_session_user(request)
    if not user:
        return JsonResponse([], safe=False)
    search = (request.GET.get('search') or '').lower().strip()
    status_f = (request.GET.get('status') or '').lower().strip()
    priority_f = (request.GET.get('priority') or '').lower().strip()
    role = _user_role(user)
    if role in ('admin', 'manager'):
        base_qs = Task.objects.filter(deleted=False, approval_status='approved').prefetch_related('assignees', 'departments')
    else:
        dept_ids = _hod_effective_depts(user)
        if user.department_id and user.department_id not in dept_ids:
            dept_ids.append(user.department_id)
        base_qs = Task.objects.filter(deleted=False, approval_status='approved', departments__in=dept_ids).distinct().prefetch_related('assignees', 'departments')
    result = []
    for t in base_qs:
        if search and search not in t.title.lower() and search not in t.description.lower():
            continue
        if status_f and (t.status or '').lower() != status_f:
            continue
        if priority_f and (t.priority or '').lower() != priority_f:
            continue
        result.append(_serialize_task(t))
    return JsonResponse(result, safe=False)

@csrf_exempt
def task_detail(request, id):
    t = Task.objects.filter(id=id).prefetch_related('assignees', 'departments').first()
    if not t:
        return JsonResponse({'error': 'Not found'}, status=404)
    if request.method == 'GET':
        user = _get_session_user(request)
        if not _is_item_visible(user, t):
            return JsonResponse({'error': 'Access denied'}, status=403)
        return JsonResponse(_serialize_task(t))
    if request.method in ('PATCH', 'PUT'):
        user = _get_session_user(request)
        if not user:
            return JsonResponse({'error': 'Unauthenticated'}, status=401)
        if _is_overdue(t):
            return JsonResponse({'error': 'This task has passed its due date and is locked. No changes are allowed.'}, status=403)
        if not _can_edit_item(user, t):
            return JsonResponse({'error': 'You do not have permission to edit this task.'}, status=403)
        body = _json_body(request)
        if _auto_approve(user):
            _apply_task_body(t, body)
            _add_activity(f"Task '{t.title}' updated by {user.display_name()}", user)
            for u in t.assignees.all():
                if u.id != user.id:
                    _add_notification(u.id, f"📋 Task '{t.title}' was updated by {user.display_name()}",
                                      ntype='task', related_id=t.id, related_type='task')
        else:
            # Only store non-empty fields to prevent wiping existing data
            safe_changes = {k: v for k, v in body.items() if v is not None and v != '' and v != []}
            # Build a change-request entry and append to the queue (supports multiple pending requests)
            change_req = {
                'change_request_id': uuid.uuid4().hex[:12],
                'changes': safe_changes,
                'submitted_by_id': user.id,
                'submitted_by_name': user.display_name(),
                'submitted_at': str(timezone.now()),
            }
            existing_pending = t.pending_changes
            if isinstance(existing_pending, list):
                existing_pending.append(change_req)
            elif isinstance(existing_pending, dict):
                existing_pending = [{'change_request_id': 'legacy', 'changes': existing_pending,
                                     'submitted_by_name': 'Previous request', 'submitted_at': ''}, change_req]
            else:
                existing_pending = [change_req]
            t.pending_changes = existing_pending
            t.edit_approval_status = 'pending'
            t.edit_requested_by = user
            t.save()
            _add_activity(f"Task '{t.title}' edit submitted for approval by {user.display_name()}", user)
            for u in User.objects.filter(role__in=['admin', 'manager'], is_active=True):
                _add_notification(u.id, f"✏️ Task '{t.title}' edit requires approval",
                                  ntype='approval', related_id=t.id, related_type='task')
        t.refresh_from_db()
        t_fresh = Task.objects.filter(id=id).prefetch_related('assignees', 'departments').first()
        return JsonResponse(_serialize_task(t_fresh))
    if request.method == 'DELETE':
        user = _get_session_user(request)
        if not user:
            return JsonResponse({'error': 'Unauthenticated'}, status=401)
        if not _is_manager(user):
            return JsonResponse({'error': 'Only Admins and Managers can delete tasks.'}, status=403)
        if _is_overdue(t):
            return JsonResponse({'error': 'This task has passed its due date and is locked. No changes are allowed.'}, status=403)
        t.deleted = True
        t.deleted_at = timezone.now()
        t.save()
        _add_activity(f"Task '{t.title}' moved to recycle bin by {user.display_name()}", user)
        return JsonResponse({'success': True})
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
def task_restore(request, id):
    user = _get_session_user(request)
    can_access = user and (_is_manager(user) or _has_extra_permission(user, 'manage_recycle_bin'))
    if not can_access:
        return JsonResponse({'error': 'Permission denied'}, status=403)
    t = Task.objects.filter(id=id).first()
    if t:
        t.deleted = False
        t.deleted_at = None
        t.save()
        _add_activity(f"Task '{t.title}' restored by {user.display_name()}", user)
    return JsonResponse({'success': True})

@csrf_exempt
def task_purge(request, id):
    user = _get_session_user(request)
    if not user or not (_is_admin(user) or _has_extra_permission(user, 'purge_items')):
        return JsonResponse({'error': 'Permission denied'}, status=403)
    t = Task.objects.filter(id=id).first()
    if t:
        _add_activity(f"Task '{t.title}' permanently deleted by {user.display_name()}", user)
        t.delete()
    return JsonResponse({'success': True})

@csrf_exempt
def task_kanban(request, id):
    user = _get_session_user(request)
    if not user:
        return JsonResponse({'error': 'Unauthenticated'}, status=401)
    t = Task.objects.filter(id=id).prefetch_related('assignees', 'departments').first()
    if not t:
        return JsonResponse({'error': 'Not found'}, status=404)
    if not _can_access_item(user, t):
        return JsonResponse({'error': 'You do not have permission to update this task.'}, status=403)
    if _is_overdue(t):
        return JsonResponse({'error': 'This task has passed its due date and is locked.'}, status=403)
    body = _json_body(request)
    _apply_task_body(t, body)
    t_fresh = Task.objects.filter(id=id).prefetch_related('assignees', 'departments').first()
    return JsonResponse(_serialize_task(t_fresh))

@csrf_exempt
def task_subtasks(request, id):
    t = Task.objects.filter(id=id).first()
    if not t:
        return JsonResponse({'error': 'Not found'}, status=404)
    if request.method == 'POST':
        user = _get_session_user(request)
        if not user:
            return JsonResponse({'error': 'Unauthenticated'}, status=401)
        if not _can_access_item(user, t):
            return JsonResponse({'error': 'You do not have permission to add subtasks.'}, status=403)
        body = _json_body(request)
        if _is_overdue(t):
            return JsonResponse({'error': 'This task has passed its due date and is locked.'}, status=403)
        sub = Subtask.objects.create(task=t, title=body.get('title', ''))
        return JsonResponse({'id': sub.id, 'task_id': id, 'title': sub.title, 'is_completed': sub.is_completed}, status=201)
    subs = Subtask.objects.filter(task=t)
    return JsonResponse([{'id': s.id, 'task_id': id, 'title': s.title, 'is_completed': s.is_completed} for s in subs], safe=False)

@csrf_exempt
def subtask_toggle(request, id):
    user = _get_session_user(request)
    if not user:
        return JsonResponse({'error': 'Unauthenticated'}, status=401)
    s = Subtask.objects.filter(id=id).first()
    if not s:
        return JsonResponse({'error': 'Subtask not found'}, status=404)
    if not _can_access_item(user, s.task):
        return JsonResponse({'error': 'You do not have permission to update this subtask.'}, status=403)
    if _is_overdue(s.task):
        return JsonResponse({'error': 'This task has passed its due date and is locked.'}, status=403)
    s.is_completed = not s.is_completed
    s.save()
    return JsonResponse({'success': True, 'subtask': {'id': s.id, 'task_id': s.task_id, 'title': s.title, 'is_completed': s.is_completed}})

@csrf_exempt
def subtask_delete(request, id):
    user = _get_session_user(request)
    if not user:
        return JsonResponse({'error': 'Unauthenticated'}, status=401)
    s = Subtask.objects.filter(id=id).first()
    if s:
        if not (_is_manager(user) or _can_access_item(user, s.task)):
            return JsonResponse({'error': 'You do not have permission to delete this subtask.'}, status=403)
        s.delete()
    return JsonResponse({'success': True})

@csrf_exempt
def task_comments(request, id):
    t = Task.objects.filter(id=id).first()
    if not t:
        return JsonResponse({'error': 'Not found'}, status=404)
    if request.method == 'POST':
        user = _get_session_user(request)
        if _is_overdue(t):
            return JsonResponse({'error': 'This task has passed its due date and is locked. Comments cannot be added.'}, status=403)
        body = _json_body(request)
        c = Comment.objects.create(task=t, user=user, content=body.get('content', ''))
        return JsonResponse({
            'id': c.id, 'task_id': id, 'content': c.content,
            'user_id': c.user_id, 'user_name': user.display_name() if user else 'Unknown',
            'created_at': c.created_at.timestamp()
        }, status=201)
    cmts = Comment.objects.filter(task=t).select_related('user').order_by('created_at')
    return JsonResponse([{
        'id': c.id, 'task_id': id, 'content': c.content,
        'user_id': c.user_id, 'user_name': c.user.display_name() if c.user else 'Unknown',
        'created_at': c.created_at.timestamp()
    } for c in cmts], safe=False)

@csrf_exempt
def comment_delete(request, id):
    user = _get_session_user(request)
    if not user:
        return JsonResponse({'error': 'Unauthenticated'}, status=401)
    c = Comment.objects.filter(id=id).first()
    if c:
        if not (_is_manager(user) or c.user_id == user.id):
            return JsonResponse({'error': 'You can only delete your own comments.'}, status=403)
        c.delete()
    return JsonResponse({'success': True})

# ── ATTACHMENTS ───────────────────────────────────────────────────────────────
def _can_view_files_for_task(user, task):
    if not user:
        return False
    role = _user_role(user)
    if role in ('admin', 'manager'):
        return True
    if role == 'head_of_department':
        hod_depts = _hod_effective_depts(user)
        task_depts = list(task.departments.values_list('id', flat=True))
        if not task_depts or any(d in hod_depts for d in task_depts):
            return True
    if role == 'senior':
        if task.assignees.filter(id=user.id).exists():
            return True
        task_depts = list(task.departments.values_list('id', flat=True))
        if task_depts and user.department_id and user.department_id in task_depts:
            return True
    return False

@csrf_exempt
def task_attachments(request, id):
    user = _get_session_user(request)
    t = Task.objects.filter(id=id).prefetch_related('departments').first()
    if not t:
        return JsonResponse({'error': 'Not found'}, status=404)
    if request.method == 'GET':
        if not user or not _can_view_files_for_task(user, t):
            return JsonResponse([], safe=False)
        atts = Attachment.objects.filter(task=t, deleted=False).prefetch_related('visible_to')
        result = []
        for a in atts:
            visible_to_ids = list(a.visible_to.values_list('id', flat=True))
            role = _user_role(user)
            if not visible_to_ids or role in ('admin', 'manager') or user.id in visible_to_ids:
                result.append({
                    'id': a.id, 'task_id': id, 'name': a.name,
                    'mime_type': a.mime_type, 'size': a.size,
                    'uploaded_by': a.uploaded_by_id,
                    'uploader_name': a.uploaded_by.display_name() if a.uploaded_by else 'Unknown',
                    'visible_to': visible_to_ids,
                    'created_at': a.created_at.timestamp()
                })
        return JsonResponse(result, safe=False)
    if request.method == 'POST':
        if not user:
            return JsonResponse({'error': 'Unauthenticated'}, status=401)
        if _is_overdue(t):
            return JsonResponse({'error': 'This task has passed its due date and is locked. Files cannot be uploaded.'}, status=403)
        if not _can_access_item(user, t):
            return JsonResponse({'error': 'You do not have permission to upload files.'}, status=403)
        body = _json_body(request)
        file_data = body.get('file_data', '')
        file_name = body.get('file_name', 'file')
        mime_type = body.get('mime_type', 'application/octet-stream')
        visible_to_ids = [int(v) for v in (body.get('visible_to') or []) if v]
        if not file_data:
            return JsonResponse({'error': 'No file data provided'}, status=400)
        try:
            raw_data = file_data.split(',')[-1] if ',' in file_data else file_data
            size = len(base64.b64decode(raw_data))
        except Exception:
            return JsonResponse({'error': 'Invalid file data encoding'}, status=400)
        a = Attachment.objects.create(
            task=t, name=file_name, data_b64=file_data,
            mime_type=mime_type, size=size, uploaded_by=user
        )
        if visible_to_ids:
            a.visible_to.set(visible_to_ids)
        _add_activity(f"File '{file_name}' uploaded to task '{t.title}' by {user.display_name()}", user)
        return JsonResponse({
            'id': a.id, 'task_id': id, 'name': a.name,
            'mime_type': a.mime_type, 'size': a.size,
            'uploaded_by': a.uploaded_by_id,
            'uploader_name': user.display_name(),
            'visible_to': visible_to_ids,
            'created_at': a.created_at.timestamp()
        }, status=201)
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
def attachment_download(request, id):
    user = _get_session_user(request)
    if not user:
        return JsonResponse({'error': 'Access denied'}, status=403)
    a = Attachment.objects.filter(id=id, deleted=False).first()
    if not a:
        return JsonResponse({'error': 'Not found'}, status=404)
    t = Task.objects.filter(id=a.task_id).prefetch_related('departments').first()
    if not t or not _can_view_files_for_task(user, t):
        return JsonResponse({'error': 'Access denied'}, status=403)
    return JsonResponse({'data_b64': a.data_b64, 'name': a.name, 'mime_type': a.mime_type})

@csrf_exempt
def attachment_delete(request, id):
    user = _get_session_user(request)
    a = Attachment.objects.filter(id=id).first()
    if a:
        if not user or not (_is_manager(user) or a.uploaded_by_id == user.id):
            return JsonResponse({'error': 'Permission denied'}, status=403)
        a.deleted = True
        a.save()
    return JsonResponse({'success': True})

@csrf_exempt
def task_submit_approval(request, id):
    t = Task.objects.filter(id=id).prefetch_related('departments').first()
    if not t:
        return JsonResponse({'error': 'Not found'}, status=404)
    t.approval_status = 'pending'
    t.save()
    user = _get_session_user(request)
    name = user.display_name() if user else 'Someone'
    dept_ids = list(t.departments.values_list('id', flat=True))
    head_uids = _get_dept_heads_for_depts(dept_ids)
    approver_ids = list(User.objects.filter(role__in=['admin', 'manager'], is_active=True).values_list('id', flat=True))
    all_approvers = list(set(head_uids + approver_ids))
    for uid in all_approvers:
        if user and uid == user.id:
            continue
        _add_notification(uid, f"🆕 Task '{t.title}' submitted for approval by {name}",
                          ntype='approval', related_id=t.id, related_type='task')
    return JsonResponse({'success': True})

@csrf_exempt
def task_approve(request, id):
    t = Task.objects.filter(id=id).prefetch_related('assignees', 'departments').first()
    if not t:
        return JsonResponse({'error': 'Not found'}, status=404)
    user = _get_session_user(request)
    if not user or not _can_approve(user):
        return JsonResponse({'error': 'Unauthorized'}, status=403)
    # HOD can only approve tasks belonging to their own department(s)
    if _is_hod(user):
        hod_depts = _hod_effective_depts(user)
        item_depts = list(t.departments.values_list('id', flat=True))
        if not any(d in hod_depts for d in item_depts):
            return JsonResponse({'error': 'You can only approve tasks for your own department.'}, status=403)
    body = _json_body(request) or {}
    change_request_id = body.get('change_request_id')
    is_edit_request = bool(t.edit_approval_status == 'pending' and t.approval_status == 'approved')
    # Capture requester_id BEFORE clearing edit_requested_by (it will be None after save+refresh)
    edit_requester_id = t.edit_requested_by_id
    if t.pending_changes:
        if isinstance(t.pending_changes, list) and change_request_id:
            # Apply only the specific change request from the queue
            pending_list = t.pending_changes
            req_to_apply = next((r for r in pending_list if r.get('change_request_id') == change_request_id), None)
            if req_to_apply:
                # Capture submitted_by if edit_requested_by is not set
                if not edit_requester_id:
                    edit_requester_id = req_to_apply.get('submitted_by_id')
                _apply_task_body(t, req_to_apply.get('changes', {}))
                remaining = [r for r in pending_list if r.get('change_request_id') != change_request_id]
                t.pending_changes = remaining if remaining else None
                if not remaining:
                    t.edit_approval_status = ''
                    t.edit_requested_by = None
            # If change_request_id not found, still proceed (may have been already applied)
        else:
            # Legacy single-dict format or no ID provided — apply all
            changes = t.pending_changes if isinstance(t.pending_changes, dict) else {}
            _apply_task_body(t, changes)
            t.pending_changes = None
            t.edit_approval_status = ''
            t.edit_requested_by = None
    if not is_edit_request:
        t.approval_status = 'approved'
    t.approved_by = user
    t.save()
    action = "edit approved" if is_edit_request else "approved"
    _add_activity(f"Task '{t.title}' {action} by {user.display_name()}", user)
    t.refresh_from_db()
    t_fresh = Task.objects.filter(id=id).prefetch_related('assignees').first()
    if is_edit_request:
        if edit_requester_id:
            _add_notification(edit_requester_id, f"✅ Your edit for task '{t.title}' was approved by {user.display_name()}",
                              ntype='approval', related_id=t.id, related_type='task')
    else:
        for u in t_fresh.assignees.all():
            _add_notification(u.id, f"✅ Task '{t.title}' has been approved by {user.display_name()}",
                              ntype='approval', related_id=t.id, related_type='task')
        if t.created_by and not t_fresh.assignees.filter(id=t.created_by_id).exists():
            _add_notification(t.created_by_id, f"✅ Your task '{t.title}' was approved by {user.display_name()}",
                              ntype='approval', related_id=t.id, related_type='task')
    return JsonResponse({'success': True})

@csrf_exempt
def task_reject(request, id):
    t = Task.objects.filter(id=id).prefetch_related('assignees', 'departments').first()
    if not t:
        return JsonResponse({'error': 'Not found'}, status=404)
    user = _get_session_user(request)
    if not user or not _can_approve(user):
        return JsonResponse({'error': 'Unauthorized'}, status=403)
    # HOD can only reject tasks belonging to their own department(s)
    if _is_hod(user):
        hod_depts = _hod_effective_depts(user)
        item_depts = list(t.departments.values_list('id', flat=True))
        if not any(d in hod_depts for d in item_depts):
            return JsonResponse({'error': 'You can only reject tasks for your own department.'}, status=403)
    body = _json_body(request)
    reason = body.get('reason', '')
    change_request_id = body.get('change_request_id')
    is_edit_request = bool(t.edit_approval_status == 'pending' and t.approval_status == 'approved')
    if is_edit_request:
        # Reject only the specific change request from the queue
        if isinstance(t.pending_changes, list) and change_request_id:
            remaining = [r for r in t.pending_changes if r.get('change_request_id') != change_request_id]
            t.pending_changes = remaining if remaining else None
            if not remaining:
                t.edit_approval_status = 'rejected'
                t.edit_requested_by = None
            # else queue still has more entries, keep edit_approval_status = 'pending'
        else:
            # Legacy: clear all pending changes
            t.pending_changes = None
            t.edit_approval_status = 'rejected'
        t.save()
        _add_activity(f"Task '{t.title}' edit request rejected by {user.display_name()}", user)
        if t.edit_requested_by_id:
            _add_notification(t.edit_requested_by_id,
                              f"❌ Your edit request for task '{t.title}' was rejected" + (f": {reason}" if reason else ""),
                              ntype='approval', related_id=t.id, related_type='task')
    else:
        t.approval_status = 'rejected'
        t.rejection_reason = reason
        t.pending_changes = None
        t.edit_approval_status = ''
        t.save()
        _add_activity(f"Task '{t.title}' rejected by {user.display_name()}", user)
        for u in t.assignees.all():
            _add_notification(u.id, f"❌ Task '{t.title}' was rejected" + (f": {reason}" if reason else ""),
                              ntype='approval', related_id=t.id, related_type='task')
        if t.created_by and not t.assignees.filter(id=t.created_by_id).exists():
            _add_notification(t.created_by_id, f"❌ Your task '{t.title}' was rejected" + (f": {reason}" if reason else ""),
                              ntype='approval', related_id=t.id, related_type='task')
    return JsonResponse({'success': True})

# ── USERS ─────────────────────────────────────────────────────────────────────
@csrf_exempt
def users_workload(request):
    user = _get_session_user(request)
    if not user:
        return JsonResponse({'error': 'Unauthenticated'}, status=401)
    role = _user_role(user)
    if role in ('admin', 'manager') or _has_extra_permission(user, 'view_analytics'):
        visible_users = User.objects.filter(is_active=True)
    elif role == 'head_of_department':
        hod_depts = _hod_effective_depts(user)
        visible_users = User.objects.filter(department_id__in=hod_depts, is_active=True)
    else:
        return JsonResponse({'error': 'Not authorised'}, status=403)
    search_filter = (request.GET.get('search') or '').lower().strip()
    dept_filter = request.GET.get('department')
    role_filter = (request.GET.get('role') or '').lower().strip()
    if dept_filter:
        visible_users = visible_users.filter(department_id=dept_filter)
    if role_filter:
        visible_users = visible_users.filter(role=role_filter)
    all_tasks = list(Task.objects.filter(deleted=False, approval_status='approved').prefetch_related('assignees'))
    all_projects = list(Project.objects.filter(deleted=False, approval_status='approved').prefetch_related('project_members'))
    result = []
    for u in visible_users:
        if search_filter:
            haystack = f"{u.username} {u.first_name} {u.last_name} {u.email}".lower()
            if search_filter not in haystack:
                continue
        user_tasks = [t for t in all_tasks if t.assignees.filter(id=u.id).exists()]
        user_projects = [p for p in all_projects if p.project_members.filter(user=u).exists() or p.created_by_id == u.id]
        result.append({
            **_serialize_user(u),
            'task_stats': {
                'total': len(user_tasks),
                'pending': len([t for t in user_tasks if t.status in ('pending', 'todo')]),
                'in_progress': len([t for t in user_tasks if t.status == 'in_progress']),
                'done': len([t for t in user_tasks if t.status in ('done', 'completed')]),
            },
            'project_stats': {
                'total': len(user_projects),
                'active': len([p for p in user_projects if (p.status or '').lower() == 'active']),
            },
        })
    return JsonResponse(result, safe=False)

@csrf_exempt
def users_list(request):
    requesting_user = _get_session_user(request)

    if request.method == 'GET':

        # Admins/managers
        if requesting_user and (
            _is_manager(requesting_user) or
            _has_extra_permission(requesting_user, 'view_all_users')
        ):
            dept_filter = request.GET.get('department')
            role_filter = (request.GET.get('role') or '').lower().strip()
            search_filter = (request.GET.get('search') or '').lower().strip()

            qs = User.objects.select_related('department').all()

            if dept_filter:
                qs = qs.filter(department_id=dept_filter)

            if role_filter:
                qs = qs.filter(role=role_filter)

            result = []

            for u in qs:
                if search_filter:
                    haystack = f"{u.username} {u.first_name} {u.last_name} {u.email}".lower()
                    if search_filter not in haystack:
                        continue

                result.append(_serialize_user(u))

            return JsonResponse(result, safe=False)

        # All other logged-in users
        else:
            if not requesting_user:
                return JsonResponse([], safe=False)

            search_filter = (request.GET.get('search') or '').lower().strip()

            qs = User.objects.select_related('department').all()

            result = []

            for u in qs:
                if search_filter:
                    haystack = f"{u.username} {u.first_name} {u.last_name} {u.email}".lower()
                    if search_filter not in haystack:
                        continue

                result.append(_serialize_user(u))

            return JsonResponse(result, safe=False)

    if request.method == 'POST':
        if not requesting_user:
            return JsonResponse({'detail': 'Unauthenticated'}, status=401)

        if not _is_manager(requesting_user) and not _has_extra_permission(requesting_user, 'manage_users'):
            return JsonResponse({'detail': 'Only admin or manager can create users.'}, status=403)

        body = _json_body(request)

        if not body.get('username', '').strip():
            return JsonResponse({'detail': 'Username is required'}, status=400)

        if not body.get('password', '').strip():
            return JsonResponse({'detail': 'Password is required'}, status=400)

        if User.objects.filter(username=body['username'].strip()).exists():
            return JsonResponse({'detail': 'Username already exists'}, status=400)

        dept_id = body.get('department')
        user_role = body.get('role', 'employee')

        raw_perms = body.get('permissions', []) if isinstance(body.get('permissions'), list) else []
        clean_perms = _strip_role_perms(raw_perms, user_role)

        u = User.objects.create_user(
            username=body['username'].strip(),
            password=body['password'],
            first_name=body.get('first_name', ''),
            last_name=body.get('last_name', ''),
            email=body.get('email', ''),
            role=user_role,
            department_id=int(dept_id) if dept_id else None,
            name=body.get('name', ''),
            phone=body.get('phone', ''),
            bio=body.get('bio', ''),
            extra_permissions=clean_perms,
        )

        return JsonResponse(_serialize_user(u), status=201)

    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
def user_detail(request, id):
    requesting_user = _get_session_user(request)
    u = User.objects.filter(id=id).select_related('department').first()
    if not u:
        return JsonResponse({'error': 'Not found'}, status=404)
    if request.method == 'GET':
        return JsonResponse(_serialize_user(u))
    if request.method in ('PATCH', 'PUT'):
        if not requesting_user:
            return JsonResponse({'error': 'Unauthenticated'}, status=401)
        # Only admin/manager can edit other users; users can edit themselves (limited fields)
        is_self = requesting_user.id == u.id
        is_privileged = _is_manager(requesting_user) or _has_extra_permission(requesting_user, 'manage_users')
        if not is_self and not is_privileged:
            return JsonResponse({'error': 'You do not have permission to edit this user.'}, status=403)
        body = _json_body(request)
        if is_privileged:
            # Privileged users can edit all fields
            for k in ('name', 'email', 'first_name', 'last_name', 'phone', 'bio', 'role'):
                if k in body:
                    setattr(u, k, body[k])
            if 'department' in body:
                u.department_id = int(body['department']) if body['department'] else None
            if 'is_active' in body:
                u.is_active = body['is_active']
            if 'permissions' in body:
                raw_perms = body['permissions'] if isinstance(body['permissions'], list) else []
                # Use the (possibly just-updated) role to strip role-inherited perms
                effective_role = body.get('role', u.role)
                u.extra_permissions = _strip_role_perms(raw_perms, effective_role)
        else:
            # Self-edit: only limited fields allowed
            for k in ('name', 'email', 'first_name', 'last_name', 'phone', 'bio'):
                if k in body:
                    setattr(u, k, body[k])
        u.save()
        return JsonResponse(_serialize_user(u))
    if request.method == 'DELETE':
        if not requesting_user or not (_is_manager(requesting_user) or _has_extra_permission(requesting_user, 'manage_users')):
            return JsonResponse({'error': 'Permission denied'}, status=403)
        u.delete()
        return JsonResponse({'success': True})
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
def user_toggle_active(request, id):
    requesting_user = _get_session_user(request)
    if not requesting_user or not (_is_manager(requesting_user) or _has_extra_permission(requesting_user, 'manage_users')):
        return JsonResponse({'error': 'Permission denied'}, status=403)
    u = User.objects.filter(id=id).first()
    if not u:
        return JsonResponse({'error': 'Not found'}, status=404)
    u.is_active = not u.is_active
    u.save()
    return JsonResponse(_serialize_user(u))

# ── ROLES ─────────────────────────────────────────────────────────────────────
def _serialize_role(r):
    user_count = User.objects.filter(role__iexact=r.name).count()
    return {
        'id': r.id,
        'name': r.name,
        'description': r.description,
        'permissions': r.permissions if isinstance(r.permissions, list) else [],
        'user_count': user_count,
    }

@csrf_exempt
def roles_list(request):
    if request.method == 'GET':
        return JsonResponse([_serialize_role(r) for r in Role.objects.all()], safe=False)
    if request.method == 'POST':
        user = _get_session_user(request)
        if not user or not (_is_admin(user) or _has_extra_permission(user, 'manage_roles')):
            return JsonResponse({'error': 'Only admin can create roles'}, status=403)
        body = _json_body(request)
        if not body.get('name', '').strip():
            return JsonResponse({'detail': 'Role name is required'}, status=400)
        r = Role.objects.create(
            name=body.get('name', '').strip(),
            description=body.get('description', ''),
            permissions=body.get('permissions', []),
        )
        return JsonResponse(_serialize_role(r), status=201)
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
def role_detail(request, id):
    r = Role.objects.filter(id=id).first()
    if not r:
        return JsonResponse({'error': 'Not found'}, status=404)
    if request.method == 'GET':
        return JsonResponse(_serialize_role(r))
    if request.method in ('PATCH', 'PUT'):
        user = _get_session_user(request)
        if not user or not (_is_admin(user) or _has_extra_permission(user, 'manage_roles')):
            return JsonResponse({'error': 'Only admin can edit roles'}, status=403)
        body = _json_body(request)
        if 'name' in body:
            r.name = body['name'].strip()
        if 'description' in body:
            r.description = body['description']
        if 'permissions' in body:
            r.permissions = body['permissions'] if isinstance(body['permissions'], list) else []
        r.save()
        return JsonResponse(_serialize_role(r))
    if request.method == 'DELETE':
        user = _get_session_user(request)
        if not user or not (_is_admin(user) or _has_extra_permission(user, 'manage_roles')):
            return JsonResponse({'error': 'Only admin can delete roles'}, status=403)
        r.delete()
        return JsonResponse({'success': True})
    return JsonResponse({'error': 'Method not allowed'}, status=405)

# ── DEPARTMENTS ────────────────────────────────────────────────────────────────
def _serialize_department(d):
    members = User.objects.filter(department=d).select_related('department')
    head = d.head_user
    return {
        'id': d.id,
        'name': d.name,
        'description': d.description,
        'head_user_id': d.head_user_id,
        'head_name': head.display_name() if head else '',
        'user_count': members.count(),
        'members': [_serialize_user(u) for u in members],
    }

@csrf_exempt
def departments_list(request):
    if request.method == 'GET':
        return JsonResponse([_serialize_department(d) for d in Department.objects.select_related('head_user').all()], safe=False)
    if request.method == 'POST':
        user = _get_session_user(request)
        if not user or not (_is_admin(user) or _has_extra_permission(user, 'manage_departments')):
            return JsonResponse({'error': 'Only admin can create departments'}, status=403)
        body = _json_body(request)
        head_user_id = body.get('head_user_id')
        try:
            head_user_id = int(head_user_id) if head_user_id else None
        except (TypeError, ValueError):
            head_user_id = None
        d = Department.objects.create(
            name=body.get('name', ''),
            description=body.get('description', ''),
            head_user_id=head_user_id
        )
        return JsonResponse(_serialize_department(d), status=201)
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
def department_detail(request, id):
    d = Department.objects.filter(id=id).select_related('head_user').first()
    if not d:
        return JsonResponse({'error': 'Not found'}, status=404)
    if request.method == 'GET':
        return JsonResponse(_serialize_department(d))
    if request.method in ('PATCH', 'PUT'):
        user = _get_session_user(request)
        if not user or not (_is_admin(user) or _has_extra_permission(user, 'manage_departments')):
            return JsonResponse({'error': 'Only admin can edit departments'}, status=403)
        body = _json_body(request)
        if 'name' in body:
            d.name = body['name']
        if 'description' in body:
            d.description = body['description']
        if 'head_user_id' in body:
            try:
                d.head_user_id = int(body['head_user_id']) if body['head_user_id'] else None
            except (TypeError, ValueError):
                d.head_user_id = None
        d.save()
        return JsonResponse(_serialize_department(d))
    if request.method == 'DELETE':
        user = _get_session_user(request)
        if not user or not (_is_admin(user) or _has_extra_permission(user, 'manage_departments')):
            return JsonResponse({'error': 'Only admin can delete departments'}, status=403)
        User.objects.filter(department=d).update(department=None)
        d.delete()
        return JsonResponse({'success': True})
    return JsonResponse({'error': 'Method not allowed'}, status=405)

# ── ACTIVITY & MESSAGES ────────────────────────────────────────────────────────
@csrf_exempt
def activity_view(request):
    user = _get_session_user(request)
    if not user or not _can_view_activity(user):
        return JsonResponse({'error': 'Access denied.'}, status=403)
    logs = ActivityLog.objects.order_by('-timestamp')[:200]
    data = [{'id': a.id, 'action': a.action, 'user': a.user_name,
             'user_id': a.user_id, 'timestamp': a.timestamp.timestamp()} for a in logs]
    return JsonResponse(data, safe=False)

@csrf_exempt
def messages_view(request):
    if request.method == 'GET':
        return JsonResponse(list(LegacyMessage.objects.values('id', 'data')), safe=False)
    if request.method == 'POST':
        m = LegacyMessage.objects.create(data=_json_body(request))
        return JsonResponse({'id': m.id, **m.data}, status=201)
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
def dm_conversation(request, user_id):
    user = _get_session_user(request)
    if not user:
        return JsonResponse({'error': 'Unauthenticated'}, status=401)
    other_id = int(user_id)
    if request.method == 'GET':
        msgs = DMMessage.objects.filter(
            sender=user, receiver_id=other_id
        ).union(
            DMMessage.objects.filter(sender_id=other_id, receiver=user)
        ).order_by('created_at')
        data = []
        for m in msgs:
            sender = User.objects.filter(id=m.sender_id).first()
            data.append({'id': m.id, 'sender_id': m.sender_id, 'receiver_id': m.receiver_id,
                         'content': m.content, 'created_at': m.created_at.timestamp(),
                         'sender': _serialize_user(sender)})
        return JsonResponse(data, safe=False)
    if request.method == 'POST':
        body = _json_body(request)
        content = (body.get('content') or '').strip()
        if not content:
            return JsonResponse({'error': 'Content required'}, status=400)
        m = DMMessage.objects.create(sender=user, receiver_id=other_id, content=content)
        return JsonResponse({'id': m.id, 'sender_id': m.sender_id, 'receiver_id': m.receiver_id,
                             'content': m.content, 'created_at': m.created_at.timestamp(),
                             'sender': _serialize_user(user)}, status=201)
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
def channels_list(request):
    user = _get_session_user(request)

    if not user:
        return JsonResponse({'error': 'Unauthenticated'}, status=401)

    if request.method == 'GET':
        channels = Channel.objects.filter(
            channelmember__user=user
        ).distinct()

        return JsonResponse([
            {
                'id': c.id,
                'name': c.name,
                'created_by': c.created_by_id,
                'created_at': c.created_at.timestamp()
            }
            for c in channels
        ], safe=False)

    if request.method == 'POST':
        body = _json_body(request)

        name = (body.get('name') or '').strip()

        if not name:
            return JsonResponse({'error': 'Name required'}, status=400)

        member_ids = body.get('members', [])

        ch = Channel.objects.create(
            name=name,
            created_by=user
        )

        # Creator is automatically a member
        ChannelMember.objects.create(
            channel=ch,
            user=user
        )

        for user_id in member_ids:
            member = User.objects.filter(id=user_id).first()

            if member:
                ChannelMember.objects.get_or_create(
                    channel=ch,
                    user=member
                )

        return JsonResponse({
            'id': ch.id,
            'name': ch.name,
            'created_by': ch.created_by_id,
            'created_at': ch.created_at.timestamp()
        }, status=201)

    return JsonResponse({'error': 'Method not allowed'}, status=405)
@csrf_exempt
def channel_detail(request, channel_id):
    user = _get_session_user(request)

    if not user:
        return JsonResponse({'error': 'Unauthenticated'}, status=401)

    ch = Channel.objects.filter(id=int(channel_id)).first()

    if not ch:
        return JsonResponse({'error': 'Channel not found'}, status=404)

    is_member = ChannelMember.objects.filter(
        channel=ch,
        user=user
    ).exists()

    if not is_member:
        return JsonResponse(
            {'error': 'You are not a member of this channel'},
            status=403
        )

    if request.method == 'GET':
        msgs = (
            ChannelMessage.objects
            .filter(channel=ch)
            .select_related('sender')
            .order_by('created_at')
        )

        messages_data = [
            {
                'id': m.id,
                'channel_id': ch.id,
                'sender_id': m.sender_id,
                'content': m.content,
                'created_at': m.created_at.timestamp(),
                'sender': _serialize_user(m.sender)
            }
            for m in msgs
        ]

        return JsonResponse({
            'id': ch.id,
            'name': ch.name,
            'created_by': ch.created_by_id,
            'created_at': ch.created_at.timestamp(),
            'messages': messages_data
        })

    if request.method == 'POST':
        body = _json_body(request)

        content = (body.get('content') or '').strip()

        if not content:
            return JsonResponse(
                {'error': 'Content required'},
                status=400
            )

        m = ChannelMessage.objects.create(
            channel=ch,
            sender=user,
            content=content
        )

        return JsonResponse({
            'id': m.id,
            'channel_id': ch.id,
            'sender_id': m.sender_id,
            'content': m.content,
            'created_at': m.created_at.timestamp(),
            'sender': _serialize_user(user)
        }, status=201)

    return JsonResponse({'error': 'Method not allowed'}, status=405)

# ── DASHBOARD ──────────────────────────────────────────────────────────────────
@csrf_exempt
def dashboard_view(request):
    user = _get_session_user(request)
    role = _user_role(user)
    if role in ('admin', 'manager'):
        accessible_projects = list(Project.objects.filter(deleted=False, approval_status='approved').prefetch_related('project_members'))
        accessible_tasks = list(Task.objects.filter(deleted=False, approval_status='approved'))
    elif role == 'head_of_department':
        hod_depts = _hod_effective_depts(user)
        if not hod_depts and user and user.department_id:
            hod_depts = [user.department_id]
        accessible_projects = [p for p in Project.objects.filter(deleted=False, approval_status='approved').prefetch_related('departments', 'project_members')
                                if any(d in hod_depts for d in p.departments.values_list('id', flat=True))]
        accessible_tasks = [t for t in Task.objects.filter(deleted=False, approval_status='approved').prefetch_related('departments')
                             if any(d in hod_depts for d in t.departments.values_list('id', flat=True))]
    else:
        accessible_tasks = [t for t in Task.objects.filter(deleted=False, approval_status='approved').prefetch_related('assignees', 'departments')
                            if _is_item_visible(user, t)] if user else []
        accessible_projects = [p for p in Project.objects.filter(deleted=False, approval_status='approved').prefetch_related('departments', 'project_members')
                               if _is_item_visible(user, p)] if user else []
    completed_tasks = [t for t in accessible_tasks if t.status in ('done', 'completed')]
    in_progress_tasks = [t for t in accessible_tasks if t.status == 'in_progress']
    pending_tasks = [t for t in accessible_tasks if t.status in ('pending', 'todo')]
    active_projects = [p for p in accessible_projects if (p.status or '').lower() == 'active']
    completed_projects = [p for p in accessible_projects if (p.status or '').lower() == 'completed']
    pending_approvals = 0
    if user and _can_approve(user):
        if role in ('admin', 'manager'):
            from django.db.models import Q as _Q
            pending_approvals = Task.objects.filter(deleted=False).filter(_Q(approval_status='pending') | _Q(edit_approval_status='pending')).count()
            pending_approvals += Project.objects.filter(deleted=False).filter(_Q(approval_status='pending') | _Q(edit_approval_status='pending')).count()
        elif role == 'head_of_department':
            hod_depts_pa = _hod_effective_depts(user)
            from django.db.models import Q as _Q
            pending_approvals = Task.objects.filter(deleted=False, departments__in=hod_depts_pa).filter(_Q(approval_status='pending') | _Q(edit_approval_status='pending')).distinct().count()
    project_list = []
    accessible_task_ids = [t.id for t in accessible_tasks]
    for p in accessible_projects:
        proj_tasks = [t for t in accessible_tasks if t.project_id == p.id]
        done = [t for t in proj_tasks if t.status in ('done', 'completed')]
        pct = round(len(done) / len(proj_tasks) * 100) if proj_tasks else 0
        pd = _serialize_project(p)
        pd.update({'total_tasks': len(proj_tasks), 'completed_tasks': len(done), 'progress_percentage': pct})
        project_list.append(pd)
    logs = ActivityLog.objects.order_by('-timestamp')[:10]
    activity_list = [{'id': a.id, 'description': a.action, 'user_name': a.user_name,
                      'timestamp': a.timestamp.timestamp()} for a in logs]
    return JsonResponse({
        'stats': {
            'total_projects': len(project_list),
            'active_projects': len(active_projects),
            'completed_projects': len(completed_projects),
            'total_tasks': len(accessible_tasks),
            'completed_tasks': len(completed_tasks),
            'in_progress_tasks': len(in_progress_tasks),
            'pending_tasks': len(pending_tasks),
            'overdue_tasks': 0,
            'total_users': User.objects.count(),
            'pending_approvals': pending_approvals,
        },
        'projects': project_list,
        'recent_activity': activity_list,
        'upcoming_tasks': [],
        'chart_data': {
            'status': {'labels': ['Pending', 'In Progress', 'Done'],
                       'data': [len(pending_tasks), len(in_progress_tasks), len(completed_tasks)]},
            'priority': {'labels': ['Low', 'Medium', 'High', 'Urgent'], 'data': [0, 0, 0, 0]},
        },
    })


# ── EXTENSION REQUESTS ─────────────────────────────────────────────────────────

def _serialize_extension_request(er):
    return {
        'id': er.id,
        'content_type': er.content_type,
        'object_id': er.object_id,
        'reason': er.reason,
        'requested_new_date': str(er.requested_new_date),
        'original_due_date': str(er.original_due_date) if er.original_due_date else None,
        'days_requested': er.days_requested,
        'status': er.status,
        'review_note': er.review_note,
        'requested_by': _serialize_user(er.requested_by) if er.requested_by else None,
        'reviewed_by': _serialize_user(er.reviewed_by) if er.reviewed_by else None,
        'created_at': er.created_at.isoformat(),
        'reviewed_at': er.reviewed_at.isoformat() if er.reviewed_at else None,
        # convenience: embed the item name
        'item_name': _ext_item_name(er),
    }

def _ext_item_name(er):
    try:
        if er.content_type == 'project':
            return Project.objects.get(id=er.object_id).name
        else:
            return Task.objects.get(id=er.object_id).title
    except Exception:
        return f"{er.content_type}#{er.object_id}"

def _ext_item_in_hod_depts(er, hod_depts):
    """Return True if the extension request's item belongs to any of the HOD's departments."""
    try:
        if er.content_type == 'project':
            item = Project.objects.prefetch_related('departments').get(id=er.object_id)
        else:
            item = Task.objects.prefetch_related('departments').get(id=er.object_id)
        item_depts = list(item.departments.values_list('id', flat=True))
        return any(d in hod_depts for d in item_depts)
    except Exception:
        return False


@csrf_exempt
def extension_requests_list(request):
    """
    GET  – list extension requests visible to the current user.
           Approvers see all pending; regular users see their own.
    """
    user = _get_session_user(request)
    if not user:
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    if _can_approve(user):
        if _is_hod(user):
            # HOD sees only extension requests for items in their own department(s)
            hod_depts = _hod_effective_depts(user)
            all_qs = ExtensionRequest.objects.select_related('requested_by', 'reviewed_by').order_by('-created_at')
            qs = [er for er in all_qs if _ext_item_in_hod_depts(er, hod_depts)]
        else:
            qs = ExtensionRequest.objects.select_related('requested_by', 'reviewed_by').order_by('-created_at')
    else:
        qs = ExtensionRequest.objects.filter(requested_by=user).select_related('requested_by', 'reviewed_by').order_by('-created_at')

    return JsonResponse([_serialize_extension_request(er) for er in qs], safe=False)


@csrf_exempt
def extension_request_create(request):
    """
    POST – submit a time-extension request for an overdue project or task.
    Body: { content_type, object_id, reason, requested_new_date }
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    user = _get_session_user(request)
    if not user:
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    body = _json_body(request)
    content_type = body.get('content_type', '').lower()
    object_id = body.get('object_id')
    reason = (body.get('reason') or '').strip()
    requested_new_date_str = body.get('requested_new_date', '')

    if content_type not in ('project', 'task'):
        return JsonResponse({'error': 'content_type must be "project" or "task"'}, status=400)
    if not reason:
        return JsonResponse({'error': 'reason is required'}, status=400)
    if not requested_new_date_str:
        return JsonResponse({'error': 'requested_new_date is required'}, status=400)

    try:
        requested_new_date = datetime.date.fromisoformat(requested_new_date_str)
    except Exception:
        return JsonResponse({'error': 'Invalid requested_new_date format (use YYYY-MM-DD)'}, status=400)

    if requested_new_date <= datetime.date.today():
        return JsonResponse({'error': 'Requested new date must be in the future'}, status=400)

    # Fetch the target item
    try:
        if content_type == 'project':
            item = Project.objects.get(id=object_id, deleted=False)
        else:
            item = Task.objects.get(id=object_id, deleted=False)
    except Exception:
        return JsonResponse({'error': f'{content_type.capitalize()} not found'}, status=404)

    if not _is_overdue(item):
        return JsonResponse({'error': f'This {content_type} is not overdue; no extension needed'}, status=400)

    # Prevent duplicate pending request
    existing = ExtensionRequest.objects.filter(
        content_type=content_type, object_id=object_id, status='pending'
    ).first()
    if existing:
        return JsonResponse({'error': 'A pending extension request already exists for this item'}, status=400)

    er = ExtensionRequest.objects.create(
        content_type=content_type,
        object_id=object_id,
        requested_by=user,
        reason=reason,
        requested_new_date=requested_new_date,
        original_due_date=item.due_date,
    )

    # Notify approvers
    approvers = User.objects.filter(role__in=['admin', 'manager'])
    item_label = item.name if content_type == 'project' else item.title
    for approver in approvers:
        _add_notification(
            approver.id,
            f"⏳ Extension request for {content_type} \"{item_label}\" by {user.display_name()} — needs your approval.",
            ntype='extension_request',
            related_id=er.id,
            related_type='extension_request',
        )

    _add_activity(f"{user.display_name()} requested a deadline extension for {content_type} \"{item_label}\" (→ {requested_new_date})", user)
    return JsonResponse(_serialize_extension_request(er), status=201)


@csrf_exempt
def extension_request_detail(request, id):
    """GET a single extension request."""
    user = _get_session_user(request)
    if not user:
        return JsonResponse({'error': 'Unauthorized'}, status=401)
    try:
        er = ExtensionRequest.objects.select_related('requested_by', 'reviewed_by').get(id=id)
    except ExtensionRequest.DoesNotExist:
        return JsonResponse({'error': 'Not found'}, status=404)
    if not _can_approve(user) and er.requested_by_id != user.id:
        return JsonResponse({'error': 'Forbidden'}, status=403)
    return JsonResponse(_serialize_extension_request(er))


@csrf_exempt
def extension_request_approve(request, id):
    """POST – approve an extension request and update the item's due_date."""
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    user = _get_session_user(request)
    if not user:
        return JsonResponse({'error': 'Unauthorized'}, status=401)
    if not _can_approve(user):
        return JsonResponse({'error': 'Only managers, admins, or heads of department can approve extensions'}, status=403)

    try:
        er = ExtensionRequest.objects.select_related('requested_by').get(id=id)
    except ExtensionRequest.DoesNotExist:
        return JsonResponse({'error': 'Extension request not found'}, status=404)

    if er.status != 'pending':
        return JsonResponse({'error': f'Request is already {er.status}'}, status=400)

    # HOD can only approve extension requests for their own department(s)
    if _is_hod(user):
        hod_depts = _hod_effective_depts(user)
        if not _ext_item_in_hod_depts(er, hod_depts):
            return JsonResponse({'error': 'You can only approve extension requests for your own department.'}, status=403)

    body = _json_body(request)
    review_note = body.get('review_note', '').strip()

    # Update the actual item's due_date
    try:
        if er.content_type == 'project':
            item = Project.objects.get(id=er.object_id)
            item_label = item.name
            item.due_date = er.requested_new_date
            item.save(update_fields=['due_date'])
        else:
            item = Task.objects.get(id=er.object_id)
            item_label = item.title
            item.due_date = er.requested_new_date
            item.save(update_fields=['due_date'])
    except Exception:
        return JsonResponse({'error': 'Associated item not found'}, status=404)

    er.status = 'approved'
    er.reviewed_by = user
    er.review_note = review_note
    er.reviewed_at = timezone.now()
    er.save()

    # Notify requester
    _add_notification(
        er.requested_by_id,
        f"✅ Your extension request for {er.content_type} \"{item_label}\" was approved. New due date: {er.requested_new_date}.",
        ntype='extension_approved',
        related_id=er.id,
        related_type='extension_request',
    )
    _add_activity(
        f"{user.display_name()} approved deadline extension for {er.content_type} \"{item_label}\" "
        f"({er.original_due_date} → {er.requested_new_date}, +{er.days_requested} days)",
        user,
    )
    return JsonResponse(_serialize_extension_request(er))


@csrf_exempt
def extension_request_reject(request, id):
    """POST – reject an extension request."""
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    user = _get_session_user(request)
    if not user:
        return JsonResponse({'error': 'Unauthorized'}, status=401)
    if not _can_approve(user):
        return JsonResponse({'error': 'Only managers, admins, or heads of department can reject extensions'}, status=403)

    try:
        er = ExtensionRequest.objects.select_related('requested_by').get(id=id)
    except ExtensionRequest.DoesNotExist:
        return JsonResponse({'error': 'Extension request not found'}, status=404)

    if er.status != 'pending':
        return JsonResponse({'error': f'Request is already {er.status}'}, status=400)

    # HOD can only reject extension requests for their own department(s)
    if _is_hod(user):
        hod_depts = _hod_effective_depts(user)
        if not _ext_item_in_hod_depts(er, hod_depts):
            return JsonResponse({'error': 'You can only reject extension requests for your own department.'}, status=403)

    body = _json_body(request)
    review_note = body.get('review_note', '').strip()

    er.status = 'rejected'
    er.reviewed_by = user
    er.review_note = review_note
    er.reviewed_at = timezone.now()
    er.save()

    item_label = _ext_item_name(er)
    _add_notification(
        er.requested_by_id,
        f"❌ Your extension request for {er.content_type} \"{item_label}\" was rejected."
        + (f" Reason: {review_note}" if review_note else ""),
        ntype='extension_rejected',
        related_id=er.id,
        related_type='extension_request',
    )
    _add_activity(
        f"{user.display_name()} rejected deadline extension for {er.content_type} \"{item_label}\"",
        user,
    )
    return JsonResponse(_serialize_extension_request(er))
#password
@csrf_exempt
def admin_change_password(request, id):
    admin = _get_session_user(request)
    if not admin:
        return JsonResponse({'error': 'Unauthenticated'}, status=401)
    if not (admin.is_superuser or getattr(admin, 'role', '') == 'admin'):
        return JsonResponse({'error': 'Permission denied'}, status=403)
    
    body = _json_body(request)
    new_pw = body.get('new_password', '')
    if len(new_pw) < 4:
        return JsonResponse({'error': 'Password too short'}, status=400)
    
    try:
        from django.contrib.auth import get_user_model  # ✅ keep this too as fallback
        User = get_user_model()
        user = User.objects.get(id=id)
        user.set_password(new_pw)
        user.save()
        return JsonResponse({'success': True})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)  # ✅ shows real error
@csrf_exempt
def dm_message_detail(request, msg_id):
    user = _get_session_user(request)
    if not user:
        return JsonResponse({'error': 'Unauthenticated'}, status=401)
    msg = DMMessage.objects.filter(id=msg_id).first()
    if not msg:
        return JsonResponse({'error': 'Not found'}, status=404)
    if msg.sender_id != user.id:
        return JsonResponse({'error': 'Permission denied'}, status=403)
    if request.method == 'DELETE':
        msg.delete()
        return JsonResponse({'success': True})
    if request.method == 'PATCH':
        body = _json_body(request)
        content = (body.get('content') or '').strip()
        if not content:
            return JsonResponse({'error': 'Content required'}, status=400)
        msg.content = content
        msg.save()
        return JsonResponse({'success': True})
    return JsonResponse({'error': 'Method not allowed'}, status=405)


@csrf_exempt
def channel_message_detail(request, msg_id):
    user = _get_session_user(request)
    if not user:
        return JsonResponse({'error': 'Unauthenticated'}, status=401)
    msg = ChannelMessage.objects.filter(id=msg_id).first()
    if not msg:
        return JsonResponse({'error': 'Not found'}, status=404)
    if msg.sender_id != user.id:
        return JsonResponse({'error': 'Permission denied'}, status=403)
    if request.method == 'DELETE':
        msg.delete()
        return JsonResponse({'success': True})
    if request.method == 'PATCH':
        body = _json_body(request)
        content = (body.get('content') or '').strip()
        if not content:
            return JsonResponse({'error': 'Content required'}, status=400)
        msg.content = content
        msg.save()
        return JsonResponse({'success': True})
    return JsonResponse({'error': 'Method not allowed'}, status=405)


@csrf_exempt
def channel_members(request, channel_id):
    user = _get_session_user(request)
    if not user:
        return JsonResponse({'error': 'Unauthenticated'}, status=401)
    ch = Channel.objects.filter(id=channel_id).first()
    if not ch:
        return JsonResponse({'error': 'Not found'}, status=404)
    if ch.created_by_id != user.id:
        return JsonResponse({'error': 'Only channel creator can manage members'}, status=403)
    if request.method == 'POST':
        body = _json_body(request)
        uid = body.get('user_id')
        if uid:
            member = User.objects.filter(id=uid).first()
            if member:
                ChannelMember.objects.get_or_create(channel=ch, user=member)
        members = [_serialize_user(cm.user) for cm in ChannelMember.objects.filter(channel=ch).select_related('user')]
        return JsonResponse({'success': True, 'members': members})
    return JsonResponse({'error': 'Method not allowed'}, status=405)


@csrf_exempt
def channel_member_detail(request, channel_id, user_id):
    user = _get_session_user(request)
    if not user:
        return JsonResponse({'error': 'Unauthenticated'}, status=401)
    ch = Channel.objects.filter(id=channel_id).first()
    if not ch:
        return JsonResponse({'error': 'Not found'}, status=404)
    if ch.created_by_id != user.id:
        return JsonResponse({'error': 'Only channel creator can manage members'}, status=403)
    if request.method == 'DELETE':
        ChannelMember.objects.filter(channel=ch, user_id=user_id).delete()
        members = [_serialize_user(cm.user) for cm in ChannelMember.objects.filter(channel=ch).select_related('user')]
        return JsonResponse({'success': True, 'members': members})
    return JsonResponse({'error': 'Method not allowed'}, status=405)