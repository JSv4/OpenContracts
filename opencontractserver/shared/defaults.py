import uuid


# When creating the new labels, use this as default so we have a valid label position if for some reason nothing is
# received from frontend
def empty_text_label_position():
    return {
        "rects": [],
        "pageNumber": 1,
        "boundingRect": {
            "x1": 0.0,
            "x2": 0.0,
            "y1": 0.0,
            "y2": 0.0,
            "width": 0.0,
            "height": 0.0,
        },
    }


def empty_bounding_box():
    return {"bottom": 0, "left": 0, "right": 0, "top": 0}


def jsonfield_default_value():  # This is a callable
    return {}


def jsonfield_empty_array():
    return []


def create_model_icon_path(instance, filename):
    # file will be uploaded to MEDIA_ROOT / user_<id>/<filename>
    return (
        f"user_{instance.creator.id}/{instance.__class__.__name__}/icons/{uuid.uuid4()}"
    )
