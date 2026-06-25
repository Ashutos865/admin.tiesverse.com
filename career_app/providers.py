import base64
import json
import mimetypes
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class ProviderError(RuntimeError):
    pass


CATEGORY_KEYS = ["Tech", "Content", "Media", "Operations"]
CATEGORY_POSITIONS = {
    "Content": ["content_editor", "content_writer_upsc", "upsc_strategist", "graphic_designer_canva", "uiux_designer"],
    "Media": ["video_editor_reels_yt", "social_media_manager_ig", "youtube_manager"],
    "Operations": ["hr", "marketing_outreach", "management_coordination", "collab_outreach"],
    "Tech": ["tech_roles"],
}
DEFAULT_GATE_KEYS = [
    "Tech",
    "Content",
    "Media",
    "Operations",
    "content_editor",
    "content_writer_upsc",
    "upsc_strategist",
    "graphic_designer_canva",
    "uiux_designer",
    "video_editor_reels_yt",
    "social_media_manager_ig",
    "youtube_manager",
    "hr",
    "marketing_outreach",
    "management_coordination",
    "collab_outreach",
    "tech_roles",
]


class CloudflareD1Provider:
    def get_candidates(self):
        return [
            self.serialize_candidate(row)
            for row in self.query_rows(
                """
                SELECT id, timestamp, department, roles, first_name, last_name, email, phone, city,
                       linkedin, portfolio, why_join, answers, resume_name, resume_key,
                       interview_status, interviewer, rating, final_decision, created_at
                FROM candidates
                ORDER BY id ASC
                """
            )
        ]

    def read_form_gates(self):
        gates = {key: True for key in DEFAULT_GATE_KEYS}
        for row in self.query_rows("SELECT key, is_open FROM form_gates"):
            gates[str(row.get("key"))] = bool(row.get("is_open"))
        return normalize_gate_hierarchy(gates)

    def write_form_gates(self, gates):
        normalized = normalize_gate_hierarchy(gates)
        for key, is_open in normalized.items():
            self.query(
                """
                INSERT INTO form_gates (key, is_open, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET is_open = excluded.is_open, updated_at = excluded.updated_at
                """,
                [key, 1 if is_open else 0, now_iso()],
            )
        return {"status": "success"}

    def update_candidate(self, row_id, data):
        self.query(
            """
            UPDATE candidates
            SET interview_status = ?, interviewer = ?, rating = ?, final_decision = ?, updated_at = ?
            WHERE id = ?
            """,
            [
                str(data.get("interview_status") or ""),
                str(data.get("interviewer") or ""),
                int(data.get("rating") or 0),
                str(data.get("final_decision") or "Under Review"),
                now_iso(),
                int(row_id),
            ],
        )
        return {"status": "success", "message": "Updated"}

    def get_resume(self, row_id):
        rows = self.query_rows(
            "SELECT resume_name, resume_key, resume_content_type FROM candidates WHERE id = ? LIMIT 1",
            [int(row_id or 0)],
        )
        if not rows or not rows[0].get("resume_key"):
            return {"status": "error", "message": "Resume not found"}
        content = R2Storage().get_object(rows[0].get("resume_key"))
        return {
            "status": "success",
            "resume_name": rows[0].get("resume_name") or "resume.pdf",
            "content_type": rows[0].get("resume_content_type") or "application/octet-stream",
            "content": content,
        }

    def serialize_candidate(self, row):
        row_id = row.get("id")
        resume_link = f"/api/career/resume/{row_id}/" if row.get("resume_key") else ""
        return {
            "timestamp": row.get("timestamp") or row.get("created_at") or "",
            "row_index": row_id,
            "department": row.get("department") or "",
            "roles": row.get("roles") or "",
            "first_name": row.get("first_name") or "",
            "last_name": row.get("last_name") or "",
            "email": row.get("email") or "",
            "phone": row.get("phone") or "",
            "city": row.get("city") or "",
            "linkedin": row.get("linkedin") or "",
            "portfolio": row.get("portfolio") or "",
            "why_join": row.get("why_join") or "",
            "answers": row.get("answers") or "",
            "resume_link": resume_link,
            "interview_status": row.get("interview_status") or "Pending Setup",
            "interviewer": row.get("interviewer") or "",
            "rating": row.get("rating") or 0,
            "final_decision": row.get("final_decision") or "Under Review",
        }

    def query_rows(self, sql, params=None):
        result = self.query(sql, params or [])
        return result.get("results") or []

    def query(self, sql, params=None):
        self.ensure_configured()
        account_id = os.environ.get("CLOUDFLARE_ACCOUNT_ID")
        db_id = os.environ.get("CLOUDFLARE_D1_DATABASE_ID")
        token = os.environ.get("CLOUDFLARE_API_TOKEN")

        endpoint = (
            "https://api.cloudflare.com/client/v4/accounts/"
            f"{account_id}/d1/database/{db_id}/query"
        )
        request = Request(
            endpoint,
            data=json.dumps({"sql": sql, "params": params or []}).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=30) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise ProviderError(f"Cloudflare D1 returned HTTP {exc.code}: {detail}") from exc
        except URLError as exc:
            raise ProviderError(f"Cloudflare D1 unreachable: {exc.reason}") from exc
        except json.JSONDecodeError as exc:
            raise ProviderError("Cloudflare D1 returned a non-JSON response") from exc

        if not payload.get("success"):
            raise ProviderError(f"Cloudflare D1 query failed: {payload.get('errors') or payload}")
        results = payload.get("result") or []
        if not results:
            return {"results": [], "meta": {}}
        first = results[0]
        if not first.get("success", True):
            raise ProviderError(f"Cloudflare D1 statement failed: {first}")
        return {"results": first.get("results") or [], "meta": first.get("meta") or {}}

    def ensure_configured(self):
        missing = [
            name
            for name in [
                "CLOUDFLARE_ACCOUNT_ID",
                "CLOUDFLARE_D1_DATABASE_ID",
                "CLOUDFLARE_API_TOKEN",
            ]
            if not os.environ.get(name)
        ]
        if missing:
            raise ProviderError("Missing Cloudflare settings: " + ", ".join(missing))


class R2Storage:
    def __init__(self):
        self.ensure_configured()

    def client(self):
        import boto3
        from botocore.config import Config

        account_id = os.environ.get("CLOUDFLARE_ACCOUNT_ID")
        access_key = os.environ.get("CLOUDFLARE_R2_ACCESS_KEY_ID")
        secret_key = os.environ.get("CLOUDFLARE_R2_SECRET_ACCESS_KEY")

        return boto3.client(
            "s3",
            endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name="auto",
            config=Config(signature_version="s3v4"),
        )

    def get_object(self, key):
        bucket = os.environ.get("CLOUDFLARE_R2_BUCKET")
        response = self.client().get_object(Bucket=bucket, Key=key)
        return response["Body"].read()

    def ensure_configured(self):
        missing = [
            name
            for name in [
                "CLOUDFLARE_ACCOUNT_ID",
                "CLOUDFLARE_R2_BUCKET",
                "CLOUDFLARE_R2_ACCESS_KEY_ID",
                "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
            ]
            if not os.environ.get(name)
        ]
        if missing:
            raise ProviderError("Missing Cloudflare R2 settings: " + ", ".join(missing))


def normalize_gate_hierarchy(incoming):
    merged = {key: True for key in DEFAULT_GATE_KEYS}
    merged.update({str(key): value is not False for key, value in (incoming or {}).items()})

    for category in CATEGORY_KEYS:
        positions = CATEGORY_POSITIONS.get(category, [])
        if merged.get(category) is False:
            for position in positions:
                merged[position] = False
            continue
        if any(merged.get(position) is not False for position in positions):
            merged[category] = True

    return {key: merged.get(key) is not False for key in DEFAULT_GATE_KEYS}


def now_iso():
    return datetime.now(timezone.utc).isoformat()
