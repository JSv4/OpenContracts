import importlib
import inspect
import pkgutil
from typing import Any

from opencontractserver.pipeline.base.embedder import BaseEmbedder
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.pipeline.base.parser import BaseParser
from opencontractserver.pipeline.base.thumbnailer import BaseThumbnailGenerator


def get_all_subclasses(module_name: str, base_class: type) -> list[type]:
    """
    Get all subclasses of a base class within a given module.

    Args:
        module_name (str): The module to search in.
        base_class (Type): The base class to find subclasses of.

    Returns:
        List[Type]: List of subclass types.
    """
    subclasses = []
    package = importlib.import_module(module_name)
    prefix = package.__name__ + "."

    for _, modname, ispkg in pkgutil.iter_modules(package.__path__, prefix):
        if not ispkg:
            module = importlib.import_module(modname)
            for name, obj in inspect.getmembers(module, inspect.isclass):
                if issubclass(obj, base_class) and obj != base_class:
                    subclasses.append(obj)
    return subclasses


def get_all_parsers() -> list[type[BaseParser]]:
    """
    Get all parser classes.

    Returns:
        List[Type[BaseParser]]: List of parser classes.
    """
    return get_all_subclasses("opencontractserver.pipeline.parsers", BaseParser)


def get_all_embedders() -> list[type[BaseEmbedder]]:
    """
    Get all embedder classes.

    Returns:
        List[Type[BaseEmbedder]]: List of embedder classes.
    """
    return get_all_subclasses("opencontractserver.pipeline.embedders", BaseEmbedder)


def get_all_thumbnailers() -> list[type[BaseThumbnailGenerator]]:
    """
    Get all thumbnail generator classes.

    Returns:
        List[Type[BaseThumbnailGenerator]]: List of thumbnail generator classes.
    """
    return get_all_subclasses(
        "opencontractserver.pipeline.thumbnailers", BaseThumbnailGenerator
    )


def get_components_by_mimetype(
    mimetype: str, detailed: bool = False
) -> dict[str, list[Any]]:
    """
    Given a mimetype, fetch lists of compatible parsers, embedders, and thumbnailers.

    Args:
        mimetype (str): The mimetype of the file.
        detailed (bool): If True, include title, description, and author details.

    Returns:
        Dict[str, List[Any]]: Dictionary with lists of compatible components.
    """
    parsers = []
    embedders = []
    thumbnailers = []
    mimetype_enum = FileTypeEnum(mimetype)

    # Get compatible parsers
    for parser_class in get_all_parsers():
        if mimetype_enum in parser_class.supported_file_types:
            if detailed:
                parsers.append(
                    {
                        "class": parser_class,
                        "title": parser_class.title,
                        "description": parser_class.description,
                        "author": parser_class.author,
                    }
                )
            else:
                parsers.append(parser_class)

    # Get compatible embedders (assuming embedders work on text output)
    for embedder_class in get_all_embedders():
        if detailed:
            embedders.append(
                {
                    "class": embedder_class,
                    "title": embedder_class.title,
                    "description": embedder_class.description,
                    "author": embedder_class.author,
                    "vector_size": embedder_class.vector_size,
                }
            )
        else:
            embedders.append(embedder_class)

    # Get compatible thumbnailers
    for thumbnailer_class in get_all_thumbnailers():
        if mimetype_enum in thumbnailer_class.supported_file_types:
            if detailed:
                thumbnailers.append(
                    {
                        "class": thumbnailer_class,
                        "title": thumbnailer_class.title,
                        "description": thumbnailer_class.description,
                        "author": thumbnailer_class.author,
                    }
                )
            else:
                thumbnailers.append(thumbnailer_class)

    return {
        "parsers": parsers,
        "embedders": embedders,
        "thumbnailers": thumbnailers,
    }


def get_metadata_for_component(component_class: type) -> dict[str, Any]:
    """
    Given a component class, return its metadata.

    Args:
        component_class (Type): The component class.

    Returns:
        Dict[str, Any]: Dictionary of metadata.
    """
    metadata = {
        "title": component_class.title,
        "description": component_class.description,
        "author": component_class.author,
        "dependencies": component_class.dependencies,
    }

    if hasattr(component_class, "vector_size"):
        metadata["vector_size"] = component_class.vector_size

    if hasattr(component_class, "supported_file_types"):
        metadata["supported_file_types"] = component_class.supported_file_types

    return metadata


def get_metadata_by_component_name(component_name: str) -> dict[str, Any]:
    """
    Given the script name of a pipeline component, fetch all metadata.

    Args:
        component_name (str): The name of the component script.

    Returns:
        Dict[str, Any]: Dictionary of metadata.
    """
    component_class = get_component_by_name(component_name)
    return get_metadata_for_component(component_class)


def get_component_by_name(component_name: str) -> type:
    """
    Given the script name or full path of a pipeline component, return the class itself.

    Args:
        component_name (str): The name or full path of the component script.

    Returns:
        Type: The component class.
    """
    # Handle full path case by extracting the module and class names
    if '.' in component_name:
        try:
            module_path, class_name = component_name.rsplit('.', 1)
            module = importlib.import_module(module_path)
            for name, obj in inspect.getmembers(module, inspect.isclass):
                if name == class_name and (
                    issubclass(obj, BaseParser) or 
                    issubclass(obj, BaseEmbedder) or 
                    issubclass(obj, BaseThumbnailGenerator)
                ):
                    return obj
        except (ModuleNotFoundError, AttributeError):
            pass
    
    # Original implementation for script name only
    base_paths = [
        "opencontractserver.pipeline.parsers",
        "opencontractserver.pipeline.embedders",
        "opencontractserver.pipeline.thumbnailers"
    ]
    
    for base_path in base_paths:
        try:
            module = importlib.import_module(f"{base_path}.{component_name}")
            for name, obj in inspect.getmembers(module, inspect.isclass):
                if (issubclass(obj, BaseParser) and obj != BaseParser) or \
                   (issubclass(obj, BaseEmbedder) and obj != BaseEmbedder) or \
                   (issubclass(obj, BaseThumbnailGenerator) and obj != BaseThumbnailGenerator):
                    return obj
        except ModuleNotFoundError:
            continue

    raise ValueError(f"Component '{component_name}' not found.")
