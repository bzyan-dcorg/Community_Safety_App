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
