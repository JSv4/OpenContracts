import base64
import pathlib
from pathlib import Path

fixtures_path = pathlib.Path(__file__).parent / "fixtures"


def package_zip_into_base64(zip_path: Path) -> str:
    return base64.b64encode(zip_path.open("rb").read()).decode("utf-8")
