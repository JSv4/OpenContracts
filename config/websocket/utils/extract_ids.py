import re


def extract_websocket_path_id(path: str, resource_type: str) -> str:
    """
    Extract ID from websocket path for a given resource type.
    
    Args:
        path: The websocket path to parse
        resource_type: The type of resource (e.g. 'document' or 'corpus')
        
    Returns:
        The extracted ID string
        
    Raises:
        ValueError: If path format is invalid
    """
    print(f"Extract {resource_type} id from path: {path}")
    match = re.match(f"^/?ws/{resource_type}/(?P<id>[-a-zA-Z0-9_=]+)/query/$", path)
    if match:
        return match.group("id")
    else:
        raise ValueError(f"Invalid path format: {path}")

