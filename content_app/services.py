"""Content Calendar business logic: task linking, status sync, activity log.

The content board has production stages a generic task does not (Scripting,
Design, Editing…). Rather than force one vocabulary on both, the two statuses are
mapped: a content item's stage implies a task state, and a task moving to Done
implies the content is Published.

Every mutation here is defensive — a failure on the task side must never block a
content save. The content row is the user's work; the task is a convenience.
"""
from .models import (
    ContentActivity, ContentItem,
    STATUS_IDEA, STATUS_SCRIPTING, STATUS_DESIGN, STATUS_EDITING,
    STATUS_REVIEW, STATUS_SCHEDULED, STATUS_PUBLISHED,
)

# content stage → task state
CONTENT_TO_TASK = {
    STATUS_IDEA: 'todo',
    STATUS_SCRIPTING: 'todo',
    STATUS_DESIGN: 'in_progress',
    STATUS_EDITING: 'in_progress',
    STATUS_REVIEW: 'review',
    STATUS_SCHEDULED: 'in_progress',
    STATUS_PUBLISHED: 'done',
}

# task state → content stage, used only when the task is moved from the task
# tracker. Deliberately conservative: we never demote a specific stage
# (Editing, Scheduled…) to a vague one, we only react to the decisive moves.
TASK_TO_CONTENT = {
    'done': STATUS_PUBLISHED,
    'review': STATUS_REVIEW,
}


def actor_name(user):
    if not user or not getattr(user, 'is_authenticated', False):
        return 'system'
    return (user.get_full_name() or user.username or 'system')


def log(item, verb, detail='', actor=None):
    """Write one activity row. Never raises — history is not worth a 500."""
    try:
        return ContentActivity.objects.create(
            item=item, verb=verb, detail=detail,
            actor_admin=actor if (actor and actor.is_authenticated) else None,
            actor_name=actor_name(actor),
        )
    except Exception:  # noqa: BLE001
        return None


def _first_assignee(item):
    """The member the linked task is assigned to: content lead, else graphics."""
    member = item.content_assignees.first()
    if member is None:
        member = item.graphics_assignees.first()
    return member


def ensure_task(item, actor=None):
    """Create or update the `Task` mirroring this content item.

    A task is only worth creating once somebody is actually assigned — an
    unassigned idea would otherwise clutter every task list. Returns the Task or
    None. Idempotent: safe to call on every save.
    """
    try:
        from career_app.models import Task

        member = _first_assignee(item)
        if member is None and item.task_id is None:
            return None                      # nothing to assign yet

        fields = {
            'title': item.title[:500],
            'description': (item.notes or '')[:5000],
            'assigned_to': member,
            'assigned_to_department': 'Content',
            'priority': item.priority,
            'status': CONTENT_TO_TASK.get(item.status, 'todo'),
            'due_date': item.due_date,
        }

        if item.task_id:
            task = item.task
            if task is None:                 # row vanished underneath us
                item.task = None
            else:
                for k, v in fields.items():
                    setattr(task, k, v)
                task.save(update_fields=list(fields.keys()))
                return task

        task = Task.objects.create(
            assigned_by_admin=actor if (actor and actor.is_authenticated) else None,
            **fields,
        )
        ContentItem.objects.filter(pk=item.pk).update(task=task)
        item.task = task
        log(item, 'task_linked', f'Linked task #{task.id}.', actor)
        return task
    except Exception:  # noqa: BLE001 — task linking must never break a content save
        return None


def sync_task_status(item, actor=None):
    """Push the content stage onto the linked task."""
    try:
        if not item.task_id or item.task is None:
            return
        want = CONTENT_TO_TASK.get(item.status)
        if want and item.task.status != want:
            item.task.status = want
            if want == 'done':
                from django.utils import timezone
                item.task.completed_at = timezone.now()
                item.task.progress = 100
                item.task.save(update_fields=['status', 'completed_at', 'progress'])
            else:
                item.task.save(update_fields=['status'])
    except Exception:  # noqa: BLE001
        pass


def sync_from_task(task, actor=None):
    """React to a task moved in the task tracker.

    Called from the task update path. Only the decisive transitions map back, so
    a content item sitting in 'Editing' is not dragged backwards by a task that
    merely says 'in progress'.
    """
    try:
        want = TASK_TO_CONTENT.get(task.status)
        if not want:
            return 0
        changed = 0
        for item in ContentItem.objects.filter(task_id=task.id).exclude(status=want):
            old = item.status
            item.status = want
            item.save(update_fields=['status', 'updated_at'])
            log(item, 'status_changed', f'{old} → {want} (from task #{task.id}).', actor)
            changed += 1
        return changed
    except Exception:  # noqa: BLE001
        return 0


def reorder_column(status, ordered_ids):
    """Persist card order within one Kanban column."""
    for position, pk in enumerate(ordered_ids):
        ContentItem.objects.filter(pk=pk, status=status).update(order=position)


def next_order(status):
    """Position for a card appended to the end of a column."""
    last = (ContentItem.objects.filter(status=status)
            .order_by('-order').values_list('order', flat=True).first())
    return (last or 0) + 1
