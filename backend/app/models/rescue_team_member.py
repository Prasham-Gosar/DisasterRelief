"""RescueTeamMember(User): single-table inheritance. member_status and team_id live on the users table."""
from sqlalchemy.orm import relationship

from app.core.enums import MemberStatus, Role
from app.models.user import User


class RescueTeamMember(User):
    __mapper_args__ = {"polymorphic_identity": Role.rescue_team_member.value}

    team = relationship(
        "RescueTeam", back_populates="members",
        primaryjoin="foreign(User.team_id) == RescueTeam.id",
    )

    @property
    def status(self) -> str | None:  # class diagram attribute `status`
        return self.member_status

    def update_task_status(self, status: MemberStatus, assignment=None) -> str:
        """updateTaskStatus() (SD msg 5). Returns 'task_acknowledged' (msg 6)."""
        self.member_status = MemberStatus(status).value
        return "task_acknowledged"

    def update_shelter_occupancy(self, *args, **kwargs):
        raise NotImplementedError("Release 2: shelter module")
