from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import (
    User, Department, Role, Project, ProjectMember,
    Task, Subtask, Comment, Attachment, ActivityLog,
    Notification, DMMessage, Channel, ChannelMessage
)


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ('username', 'email', 'first_name', 'last_name', 'role', 'department', 'is_active', 'is_staff')
    list_filter = ('role', 'is_active', 'is_staff', 'department')
    search_fields = ('username', 'email', 'first_name', 'last_name')
    ordering = ('username',)
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Profile', {'fields': ('name', 'role', 'department', 'phone', 'bio', 'extra_permissions')}),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ('Profile', {'fields': ('name', 'role', 'department', 'phone', 'bio')}),
    )


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ('name', 'description', 'head_user')
    search_fields = ('name',)


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ('name', 'description')
    search_fields = ('name',)


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ('name', 'status', 'approval_status', 'created_by', 'created_at', 'deleted')
    list_filter = ('status', 'approval_status', 'deleted')
    search_fields = ('name', 'description')


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ('title', 'status', 'priority', 'approval_status', 'project', 'created_by', 'created_at', 'deleted')
    list_filter = ('status', 'priority', 'approval_status', 'deleted')
    search_fields = ('title', 'description')


@admin.register(ProjectMember)
class ProjectMemberAdmin(admin.ModelAdmin):
    list_display = ('project', 'user', 'role_in_project')


@admin.register(Subtask)
class SubtaskAdmin(admin.ModelAdmin):
    list_display = ('title', 'task', 'is_completed')


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ('task', 'user', 'created_at')


@admin.register(Attachment)
class AttachmentAdmin(admin.ModelAdmin):
    list_display = ('name', 'task', 'uploaded_by', 'mime_type', 'size', 'created_at')


@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):
    list_display = ('action', 'user_name', 'timestamp')
    list_filter = ('timestamp',)


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('user', 'message', 'type', 'read', 'created_at')
    list_filter = ('type', 'read')


@admin.register(DMMessage)
class DMMessageAdmin(admin.ModelAdmin):
    list_display = ('sender', 'receiver', 'created_at')


@admin.register(Channel)
class ChannelAdmin(admin.ModelAdmin):
    list_display = ('name', 'created_by', 'created_at')


@admin.register(ChannelMessage)
class ChannelMessageAdmin(admin.ModelAdmin):
    list_display = ('channel', 'sender', 'created_at')
