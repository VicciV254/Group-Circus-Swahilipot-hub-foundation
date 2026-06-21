from django.apps import AppConfig


class ProjectsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.projects'
    verbose_name = 'Projects & Task Management'

    def ready(self):
        # Import signal handlers (notifications, audit logging, etc.)
        try:
            import apps.projects.signals  # noqa: F401
        except ImportError:
            pass

        self._run_startup_backfill()

    def _run_startup_backfill(self):
        """
        Auto-runs the Kanban board backfill once, on actual server startup
        (not on every management command, and not twice under the
        autoreloader's parent watcher process).
        """
        import os
        import sys

        # Only fire for `runserver` — skip migrate, makemigrations, shell,
        # tests, collectstatic, etc., since those don't need this and some
        # (migrate, makemigrations) may run before tables even exist.
        if 'runserver' not in sys.argv:
            return

        # Django's autoreloader spawns a parent "watcher" process and a child
        # "real" server process. RUN_MAIN is only set to 'true' inside the
        # child. Without this check the backfill would run twice on every
        # save during development.
        if os.environ.get('RUN_MAIN') != 'true':
            return

        try:
            from django.db import connection
            from .models import Project, KanbanBoard, KanbanColumn, TaskStatus

            # Defensive: bail out quietly if migrations haven't created the
            # table yet (e.g. brand-new database before first `migrate`).
            if 'projects_project' not in connection.introspection.table_names():
                return

            projects_without_board = Project.objects.filter(kanban_boards__isnull=True)
            count = projects_without_board.count()
            if count == 0:
                return

            default_columns = [
                ('Backlog',     '#9CA3AF', TaskStatus.BACKLOG,     None),
                ('To Do',       '#6B7280', TaskStatus.PENDING,     None),
                ('In Progress', '#6366F1', TaskStatus.IN_PROGRESS, None),
                ('In Review',   '#8B5CF6', TaskStatus.IN_REVIEW,   None),
                ('Done',        '#10B981', TaskStatus.DONE,        None),
            ]

            for project in projects_without_board:
                actor = project.owner or project.created_by
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

            print(f'[apps.projects] Backfilled Kanban boards for {count} project(s) on startup.')

        except Exception as exc:
            # Never let a startup convenience task crash the whole server.
            print(f'[apps.projects] Kanban board backfill skipped due to error: {exc}')