from app.models.audit_log import AuditLog


def log(
    db,
    actor,
    action: str,
    entity_type: str,
    entity_id: int,
    from_status: str | None = None,
    to_status: str | None = None,
    remark: str | None = None,
) -> None:
    """SE-5: add an audit row to the CURRENT transaction (no commit here)."""
    label = "system"
    if actor is not None:
        label = getattr(actor, "public_code", None) or getattr(actor, "name", None) or f"user-{actor.id}"
    db.add(
        AuditLog(
            actor_user_id=getattr(actor, "id", None),
            actor_label=label,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            from_status=from_status,
            to_status=to_status,
            remark=remark,
        )
    )
