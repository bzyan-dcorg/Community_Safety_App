# RUN

cd backend
python -m venv venv
source venv/bin/activate  # Windows - venv\\Scripts\\activate
pip install -r requirements.txt  # run inside backend/ so the editable install succeeds
uvicorn backend.main:app --reload

# Troubleshooting
- If your environment blocks downloads from PyPI, add `--no-build-isolation` to the `pip install` command so it can reuse the
  already-installed build tooling.
- If you prefer not to perform the editable install, you can run `uvicorn main:app --reload` after activating the virtual
  environment.

## Sensitive role approvals

1. Run `python -m backend.scripts.bootstrap_admin --email admin@example.com --password <pwd>` to create the first `admin` reviewer.
2. When `/auth/register`, `/auth/login`, or `/auth/oauth` receives `staff` / `reporter` / `officer`, the API stores a pending record in `role_requests` and keeps the user as a resident until approval.
3. Reviewers (admin/officer) can call:
   - `GET /role-requests/?status_filter=pending` to retrieve the queue.
   - `POST /role-requests/{id}/decision` with `{"action":"approve"|"deny","notes":"..."}` (plus optional `role`) to approve or deny. Approved requests automatically elevate the user role.
