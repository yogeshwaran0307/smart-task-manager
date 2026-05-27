from django.db import models
from django.contrib.auth.models import AbstractUser
import re


class Department(models.Model):
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    head_user = models.ForeignKey(
        'User', null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='headed_departments'
    )

    def __str__(self):
        return self.name


class User(AbstractUser):
    ROLE_CHOICES = [
        ('admin', 'Admin'), ('manager', 'Manager'),
        ('head_of_department', 'Head of Department'),
        ('senior', 'Senior'), ('junior', 'Junior'), ('employee', 'Employee'),
    ]
    name = models.CharField(max_length=200, blank=True)
    role = models.CharField(max_length=50, choices=ROLE_CHOICES, default='employee')
    department = models.ForeignKey(
        Department, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='members'
    )
    phone = models.CharField(max_length=50, blank=True)
    bio = models.TextField(blank=True)
    extra_permissions = models.JSONField(default=list)
    groups = models.ManyToManyField('auth.Group', blank=True, related_name='api_user_groups')
    user_permissions = models.ManyToManyField('auth.Permission', blank=True, related_name='api_user_permissions')

    def display_name(self):
        if self.name:
            return self.name
        full = f"{self.first_name} {self.last_name}".strip()
        return full or self.username

    def __str__(self):
        return self.display_name()


class Role(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, default='')
    permissions = models.JSONField(default=list)

    def __str__(self):
        return self.name


def _generate_project_code(name):
    """
    Generate a unique project code from the project name.
    Format: XX-NNN  (first 2 letters of name, zero-padded 3-digit number)
    Example: 'Smart Task Manager' → 'SM-001'
    Uses MAX of existing numbers to avoid duplicates even after deletions.
    """
    prefix = ''.join([c for c in name.upper() if c.isalpha()][:2]).ljust(2, 'X')
    # Find the highest existing number for this prefix (including deleted)
    pattern = re.compile(rf'^{re.escape(prefix)}-(\d+)$')
    existing = Project.objects.filter(project_code__startswith=f'{prefix}-').values_list('project_code', flat=True)
    max_num = 0
    for code in existing:
        m = pattern.match(code)
        if m:
            max_num = max(max_num, int(m.group(1)))
    return f"{prefix}-{max_num + 1:03d}"


class Project(models.Model):
    project_code = models.CharField(max_length=20, unique=True, blank=True)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=50, default='active')
    priority = models.CharField(max_length=50, blank=True)
    due_date = models.DateField(null=True, blank=True)
    eta = models.CharField(max_length=200, blank=True, help_text='Estimated time to complete (e.g. 2 weeks, 3 days)')
    approval_status = models.CharField(max_length=50, default='pending')
    rejection_reason = models.TextField(blank=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='created_projects')
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_projects')
    departments = models.ManyToManyField(Department, blank=True, related_name='projects')
    deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    pending_changes = models.JSONField(null=True, blank=True)
    edit_approval_status = models.CharField(max_length=50, blank=True)
    edit_requested_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='project_edit_requests')

    def save(self, *args, **kwargs):
        if not self.project_code:
            self.project_code = _generate_project_code(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.project_code} - {self.name}"


class ProjectMember(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='project_members')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='project_memberships')
    role_in_project = models.CharField(max_length=100, blank=True)

    class Meta:
        unique_together = ('project', 'user')


def _generate_task_code(project):
    """
    Generate a unique task code tied to the parent project.
    Format: <PROJECT_CODE>-T<NNN>  (zero-padded 3-digit number)
    Example: project SM-001 → task SM-001-T001
    Falls back to TSK-NNN for tasks without a project.
    Uses MAX of existing task numbers to avoid duplicates after deletions.
    """
    if project and project.project_code:
        prefix = project.project_code
        pattern = re.compile(rf'^{re.escape(prefix)}-T(\d+)$')
        existing = Task.objects.filter(project=project).values_list('task_code', flat=True)
        max_num = 0
        for code in existing:
            m = pattern.match(code)
            if m:
                max_num = max(max_num, int(m.group(1)))
        return f"{prefix}-T{max_num + 1:03d}"
    else:
        # No project — use global TSK sequence
        pattern = re.compile(r'^TSK-(\d+)$')
        existing = Task.objects.filter(project__isnull=True).values_list('task_code', flat=True)
        max_num = 0
        for code in existing:
            m = pattern.match(code)
            if m:
                max_num = max(max_num, int(m.group(1)))
        return f"TSK-{max_num + 1:03d}"


class Task(models.Model):
    task_code = models.CharField(max_length=30, unique=True, blank=True)
    title = models.CharField(max_length=500)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=50, default='pending')
    priority = models.CharField(max_length=50, blank=True)
    due_date = models.DateField(null=True, blank=True)
    eta = models.CharField(max_length=200, blank=True, help_text='Estimated time to complete (e.g. 4 hours, 2 days)')
    project = models.ForeignKey(Project, on_delete=models.SET_NULL, null=True, blank=True, related_name='tasks')
    assignees = models.ManyToManyField(User, blank=True, related_name='assigned_tasks')
    departments = models.ManyToManyField(Department, blank=True, related_name='tasks')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='created_tasks')
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_tasks')
    approval_status = models.CharField(max_length=50, default='pending')
    rejection_reason = models.TextField(blank=True)
    deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    pending_changes = models.JSONField(null=True, blank=True)
    edit_approval_status = models.CharField(max_length=50, blank=True)
    edit_requested_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='task_edit_requests')

    def save(self, *args, **kwargs):
        if not self.task_code:
            self.task_code = _generate_task_code(self.project)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.task_code} - {self.title}"


class Subtask(models.Model):
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='subtasks')
    title = models.CharField(max_length=500)
    is_completed = models.BooleanField(default=False)


class Comment(models.Model):
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='comments')
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)


class Attachment(models.Model):
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='attachments')
    name = models.CharField(max_length=500)
    data_b64 = models.TextField()
    mime_type = models.CharField(max_length=200, default='application/octet-stream')
    size = models.IntegerField(default=0)
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='uploaded_attachments')
    visible_to = models.ManyToManyField(User, blank=True, related_name='visible_attachments')
    deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)


class ActivityLog(models.Model):
    action = models.TextField()
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='activities')
    user_name = models.CharField(max_length=200, default='System')
    timestamp = models.DateTimeField(auto_now_add=True)


class Notification(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    message = models.TextField()
    type = models.CharField(max_length=50, default='info')
    read = models.BooleanField(default=False)
    related_id = models.IntegerField(null=True, blank=True)
    related_type = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class DMMessage(models.Model):
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sent_dms')
    receiver = models.ForeignKey(User, on_delete=models.CASCADE, related_name='received_dms')
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)


class Channel(models.Model):
    name = models.CharField(max_length=200)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_channels')
    created_at = models.DateTimeField(auto_now_add=True)


class ChannelMessage(models.Model):
    channel = models.ForeignKey(Channel, on_delete=models.CASCADE, related_name='channel_msgs')
    sender = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='channel_messages_sent')
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)


class LegacyMessage(models.Model):
    data = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)


class ExtensionRequest(models.Model):
    """Time-extension request for a locked (overdue) project or task."""
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]
    content_type = models.CharField(max_length=20)          # 'project' or 'task'
    object_id = models.IntegerField()
    requested_by = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='extension_requests'
    )
    reason = models.TextField()
    requested_new_date = models.DateField()                  # proposed new due date
    original_due_date = models.DateField(null=True, blank=True)
    days_requested = models.IntegerField(default=0)          # calculated at save
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    reviewed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='reviewed_extensions'
    )
    review_note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        import datetime
        if self.original_due_date and self.requested_new_date:
            delta = self.requested_new_date - self.original_due_date
            self.days_requested = max(delta.days, 0)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"ExtensionRequest({self.content_type}#{self.object_id} → {self.requested_new_date})"
