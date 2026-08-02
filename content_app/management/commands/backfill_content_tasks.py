"""Give every content assignee their own task.

The first version of the linker created a single task per content item, assigned
to whoever happened to be first in the list — so on an item with three people,
two of them never saw the work. This reconciles existing items: each assignee
gets a task, and any that already exist are left alone.

    python manage.py backfill_content_tasks --dry-run
    python manage.py backfill_content_tasks
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Create one task per assignee for existing content items.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='Report what would change without writing.')

    def handle(self, *args, **options):
        from content_app.models import ContentItem
        from content_app import services

        dry = options['dry_run']
        items = ContentItem.objects.prefetch_related(
            'content_assignees', 'graphics_assignees', 'tasks').all()

        total_new = 0
        for item in items:
            people = services.assignees_of(item)
            have = {t.assigned_to_id for t in item.tasks.all() if t.assigned_to_id}
            # The pre-existing single task predates the M2M, so adopt it.
            if item.task_id and item.task_id not in {t.id for t in item.tasks.all()}:
                if not dry:
                    item.tasks.add(item.task)
                have.add(item.task.assigned_to_id if item.task else None)

            missing = [(m, tr) for m, tr in people if m.id not in have]
            if not people:
                continue

            self.stdout.write(
                f'  "{item.title[:44]}" — {len(people)} assignee(s), '
                f'{len(have - {None})} task(s), {len(missing)} missing')
            for m, track in missing:
                self.stdout.write(f'      + {m.candidate_name} ({track})')
            total_new += len(missing)

            if missing and not dry:
                services.ensure_task(item, None)

        if dry:
            self.stdout.write(self.style.WARNING(
                f'[dry] {total_new} task(s) would be created. Nothing written.'))
        else:
            self.stdout.write(self.style.SUCCESS(
                f'Created {total_new} task(s).'))
