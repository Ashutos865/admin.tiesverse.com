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


def assignees_of(item):
    """Everyone working on this item, with the track they are on.

    Returns [(member, 'Content'|'Graphics')]. Somebody on both tracks appears
    once (they only need one task), attributed to Content.
    """
    seen, out = set(), []
    for m in item.content_assignees.all():
        if m.id not in seen:
            seen.add(m.id)
            out.append((m, 'Content'))
    for m in item.graphics_assignees.all():
        if m.id not in seen:
            seen.add(m.id)
            out.append((m, 'Graphics'))
    return out


def ensure_task(item, actor=None):
    """Create/update/remove one Task PER ASSIGNEE for this content item.

    `career_app.Task.assigned_to` is a ForeignKey, so a single task can only name
    one person — with three people on a piece of content, one task means two of
    them never see the work. So each assignee gets their own task, all linked
    back to the item through `item.tasks`.

    Idempotent and reconciling: called on every save, it creates tasks for new
    assignees, updates existing ones, and deletes tasks for people who have been
    removed (unless that person already finished, in which case the record of
    their work is kept). Returns the list of live tasks.
    """
    try:
        from career_app.models import Task

        pairs = assignees_of(item)
        want = {m.id: (m, track) for m, track in pairs}

        existing = {t.assigned_to_id: t for t in item.tasks.all() if t.assigned_to_id}

        # Someone was un-assigned: drop their task, unless they already did it.
        for member_id, task in list(existing.items()):
            if member_id not in want:
                if task.status == 'done':
                    item.tasks.remove(task)          # keep the completed record
                else:
                    item.tasks.remove(task)
                    task.delete()
                existing.pop(member_id, None)

        common = {
            'title': item.title[:500],
            'description': (item.notes or '')[:5000],
            'priority': item.priority,
            'status': CONTENT_TO_TASK.get(item.status, 'todo'),
            'due_date': item.due_date,
        }

        live = []
        for member_id, (member, track) in want.items():
            task = existing.get(member_id)
            if task is not None:
                for k, v in common.items():
                    setattr(task, k, v)
                task.assigned_to_department = track
                task.save(update_fields=[*common.keys(), 'assigned_to_department'])
            else:
                task = Task.objects.create(
                    assigned_to=member,
                    assigned_to_department=track,
                    assigned_by_admin=actor if (actor and actor.is_authenticated) else None,
                    **common,
                )
                item.tasks.add(task)
                log(item, 'task_linked',
                    f'Task #{task.id} assigned to {member.candidate_name} ({track}).', actor)
                # Only NEW assignees are notified — re-saving an item must not
                # message everyone again.
                if item.notify_on_assign:
                    try:
                        from . import whatsapp
                        whatsapp.notify_assignment(item, member, track, actor)
                    except Exception:  # noqa: BLE001 — never block the save
                        pass
            live.append(task)

        # `task` stays as the primary pointer so older reads keep working.
        primary = live[0] if live else None
        if (primary.id if primary else None) != item.task_id:
            ContentItem.objects.filter(pk=item.pk).update(task=primary)
            item.task = primary
        return live
    except Exception:  # noqa: BLE001 — task linking must never break a content save
        return []


def sync_task_status(item, actor=None):
    """Push the content stage onto EVERY linked task, not just the first."""
    try:
        want = CONTENT_TO_TASK.get(item.status)
        if not want:
            return
        from django.utils import timezone
        for task in item.tasks.all():
            if task.status == want:
                continue
            task.status = want
            if want == 'done':
                task.completed_at = timezone.now()
                task.progress = 100
                task.save(update_fields=['status', 'completed_at', 'progress'])
            else:
                task.save(update_fields=['status'])
    except Exception:  # noqa: BLE001
        pass


def sync_from_task(task, actor=None):
    """React to a task moved in the task tracker.

    Only the decisive transitions map back, so a content item sitting in
    'Editing' is not dragged backwards by a task that merely says 'in progress'.

    With one task per assignee, a content item is only Published once EVERY
    assignee is done — one person finishing their part does not finish the piece.
    """
    try:
        want = TASK_TO_CONTENT.get(task.status)
        if not want:
            return 0
        from django.db.models import Q

        changed = 0
        # One Q, not two querysets ORed together — combining a .distinct() qs
        # with a plain one raises "Cannot combine a unique query with a
        # non-unique query", which the except below would silently swallow.
        items = ContentItem.objects.filter(
            Q(tasks__id=task.id) | Q(task_id=task.id)).distinct()
        for item in items:
            if item.status == want:
                continue
            if want == STATUS_PUBLISHED:
                # Read the sibling statuses FRESH — `item.tasks.all()` may be a
                # prefetched cache from the queryset above, which would still
                # show the status the moved task had before it was saved.
                pending = (item.tasks.exclude(status='done')
                           .exclude(status='cancelled').count())
                if pending:
                    continue          # somebody else is still working on it
            old = item.status
            item.status = want
            item.save(update_fields=['status', 'updated_at'])
            log(item, 'status_changed', f'{old} → {want} (from task #{task.id}).', actor)
            changed += 1
        return changed
    except Exception as exc:  # noqa: BLE001 — never break the caller's task save
        # Log it: a silent `return 0` here once hid a real query bug for a while.
        print(f'[content sync_from_task] task={task.id}: {exc}')
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
