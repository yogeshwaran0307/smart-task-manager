from django.core.management.base import BaseCommand
from api.models import User, Department, Role, Project, Task, Channel
import datetime


class Command(BaseCommand):
    help = 'Seed initial data'

    def handle(self, *args, **options):
        self.stdout.write('Setting up initial data...')

        # ── Departments ────────────────────────────────────────────
        dept_dev, _ = Department.objects.get_or_create(
            name='Development',
            defaults={'description': 'Software development team'}
        )
        dept_test, _ = Department.objects.get_or_create(
            name='Testing',
            defaults={'description': 'QA and testing team'}
        )
        dept_design, _ = Department.objects.get_or_create(
            name='Design',
            defaults={'description': 'UI/UX design team'}
        )
        self.stdout.write(self.style.SUCCESS('✓ Departments ready'))

        # ── Admin user ─────────────────────────────────────────────
        admin = User.objects.filter(username='admin').first()
        if admin:
            admin.set_password('admin')
            admin.is_active = True
            admin.is_staff = True
            admin.is_superuser = True
            admin.role = 'admin'
            admin.name = 'Admin User'
            admin.save()
            self.stdout.write('✓ Admin user password reset to: admin')
        else:
            admin = User.objects.create_superuser(
                username='admin',
                password='admin',
                email='admin@example.com',
                first_name='Admin',
                last_name='User',
                role='admin',
                name='Admin User',
            )
            self.stdout.write(self.style.SUCCESS('✓ Admin user created (username: admin, password: admin)'))

        # ── Sample users ───────────────────────────────────────────
        if not User.objects.filter(username='manager1').exists():
            User.objects.create_user(
                username='manager1', password='manager1',
                first_name='John', last_name='Manager',
                email='manager@example.com',
                role='manager', name='John Manager',
                department=dept_dev, is_active=True,
            )
            self.stdout.write('✓ Sample manager user created (username: manager1, password: manager1)')

        if not User.objects.filter(username='employee1').exists():
            User.objects.create_user(
                username='employee1', password='employee1',
                first_name='Jane', last_name='Employee',
                email='employee@example.com',
                role='employee', name='Jane Employee',
                department=dept_dev, is_active=True,
            )
            self.stdout.write('✓ Sample employee created (username: employee1, password: employee1)')

        # ── Default custom roles ───────────────────────────────────
        default_roles = [
            ('Team Lead', 'Leads a specific team within a department', ['create_projects', 'manage_members']),
            ('Intern', 'Entry level position with limited access', []),
            ('Contractor', 'External contractor with project access', ['view_all_projects']),
        ]
        for rname, rdesc, rperms in default_roles:
            role, created = Role.objects.get_or_create(
                name=rname,
                defaults={'description': rdesc, 'permissions': rperms}
            )
            if created:
                self.stdout.write(f'✓ Custom role created: {rname}')
        self.stdout.write('✓ Custom roles ready')

        # ── Sample projects ────────────────────────────────────────
        # due_date and eta are required fields
        future_date = (datetime.date.today() + datetime.timedelta(days=90)).isoformat()
        completed_date = (datetime.date.today() - datetime.timedelta(days=10)).isoformat()

        p1, p1_created = Project.objects.get_or_create(
            name='Smart Task Manager',
            defaults={
                'description': 'Main platform project for managing tasks and teams',
                'status': 'active',
                'created_by': admin,
                'approval_status': 'approved',
                'priority': 'high',
                'due_date': future_date,
                'eta': '3 months',
            }
        )
        if p1_created:
            p1.departments.add(dept_dev)
            self.stdout.write(f'✓ Project created: {p1.project_code} - {p1.name}')

        p2, p2_created = Project.objects.get_or_create(
            name='Portfolio Website',
            defaults={
                'description': 'Company portfolio and landing page',
                'status': 'completed',
                'created_by': admin,
                'approval_status': 'approved',
                'priority': 'medium',
                'due_date': completed_date,
                'eta': '1 month',
            }
        )
        if p2_created:
            p2.departments.add(dept_design)
            self.stdout.write(f'✓ Project created: {p2.project_code} - {p2.name}')

        self.stdout.write('✓ Projects ready')

        # ── Sample tasks ───────────────────────────────────────────
        task_due = (datetime.date.today() + datetime.timedelta(days=30)).isoformat()

        if not Task.objects.filter(title='Design UI Mockups').exists():
            t1 = Task.objects.create(
                title='Design UI Mockups',
                description='Create wireframes and mockups for all screens',
                status='pending', priority='high',
                project=p1, created_by=admin,
                approval_status='approved',
                due_date=task_due,
                eta='1 week',
            )
            t1.departments.add(dept_design)
            self.stdout.write(f'✓ Task created: {t1.task_code} - {t1.title}')

        if not Task.objects.filter(title='Connect Backend API').exists():
            t2 = Task.objects.create(
                title='Connect Backend API',
                description='Wire up all frontend components to backend endpoints',
                status='in_progress', priority='high',
                project=p1, created_by=admin,
                approval_status='approved',
                due_date=task_due,
                eta='2 weeks',
            )
            t2.departments.add(dept_dev)
            self.stdout.write(f'✓ Task created: {t2.task_code} - {t2.title}')

        if not Task.objects.filter(title='Write Unit Tests').exists():
            t3 = Task.objects.create(
                title='Write Unit Tests',
                description='Cover all critical paths with automated tests',
                status='pending', priority='medium',
                project=p1, created_by=admin,
                approval_status='approved',
                due_date=task_due,
                eta='1 week',
            )
            t3.departments.add(dept_test)
            self.stdout.write(f'✓ Task created: {t3.task_code} - {t3.title}')

        self.stdout.write('✓ Tasks ready')

        # ── Default channel ────────────────────────────────────────
        Channel.objects.get_or_create(
            name='general',
            defaults={'created_by': admin}
        )
        self.stdout.write('✓ Default channel ready')

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('═' * 45))
        self.stdout.write(self.style.SUCCESS('  Setup complete!'))
        self.stdout.write(self.style.SUCCESS('  Login: admin / admin'))
        self.stdout.write(self.style.SUCCESS('═' * 45))
