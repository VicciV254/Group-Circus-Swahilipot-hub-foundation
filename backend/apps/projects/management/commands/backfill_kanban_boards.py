"""
Enterprise Internship Management System
Projects App — Backfill Command

Creates a default Kanban board + standard columns for any existing project
that doesn't have one yet. Needed for projects created before the
auto-board-creation logic was added to ProjectViewSet.perform_create.

Usage:
    python manage.py backfill_kanban_boards
    python manage.py backfill_kanban_boards --dry-run
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

from apps.projects.models import Project, KanbanBoard, KanbanColumn, TaskStatus

User = get_user_model()


class Command(BaseCommand):
    help = 'Backfill default Kanban boards for projects missing one.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be created without actually creating it.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        projects_without_board = Project.objects.filter(kanban_boards__isnull=True)
        count = projects_without_board.count()

        if count == 0:
            self.stdout.write(self.style.SUCCESS('All projects already have a Kanban board. Nothing to do.'))
            return

        self.stdout.write(f'Found {count} project(s) without a Kanban board.')

        default_columns = [
            ('Backlog',     '#9CA3AF', TaskStatus.BACKLOG,     None),
            ('To Do',       '#6B7280', TaskStatus.PENDING,     None),
            ('In Progress', '#6366F1', TaskStatus.IN_PROGRESS, None),
            ('In Review',   '#8B5CF6', TaskStatus.IN_REVIEW,   None),
            ('Done',        '#10B981', TaskStatus.DONE,        None),
        ]

        for project in projects_without_board:
            actor = project.owner or project.created_by

            if dry_run:
                self.stdout.write(f'  [dry-run] Would create board for "{project.name}" ({project.code})')
                continue

            board = KanbanBoard.objects.create(
                project=project,
                name='Main Board',
                is_default=True,
                created_by=actor,
            )
            for position, (name, color, maps_to_status, wip_limit) in enumerate(default_columns):
                KanbanColumn.objects.create(
                    board=board,
                    name=name,
                    color=color,
                    position=position,
                    maps_to_status=maps_to_status,
                    wip_limit=wip_limit,
                    created_by=actor,
                )
            self.stdout.write(self.style.SUCCESS(f'  Created board for "{project.name}" ({project.code})'))

        if dry_run:
            self.stdout.write(self.style.WARNING('Dry run complete. No changes were made.'))
        else:
            self.stdout.write(self.style.SUCCESS(f'Done. Backfilled {count} project(s).'))