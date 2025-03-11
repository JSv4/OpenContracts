import importlib
import inspect
import logging
import pkgutil
from typing import Any, Optional, Union

from django.conf import settings

from opencontractserver.pipeline.base.embedder import BaseEmbedder
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.pipeline.base.parser import BaseParser
from opencontractserver.pipeline.base.post_processor import BasePostProcessor
from opencontractserver.pipeline.base.thumbnailer import BaseThumbnailGenerator
from opencontractserver.types.dicts import OpenContractsExportDataJsonPythonType

logger = logging.getLogger(__name__)


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


def get_all_post_processors() -> list[type[BasePostProcessor]]:
    """
    Get all post-processor classes.

    Returns:
        List[Type[BasePostProcessor]]: List of post-processor classes.
    """
    return get_all_subclasses(
        "opencontractserver.pipeline.post_processors", BasePostProcessor
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
    post_processors = []
    
    # Convert mimetype to FileTypeEnum
    mimetype_enum = FileTypeEnum.from_mimetype(mimetype)
    
    # If mimetype is not supported, return empty lists
    if mimetype_enum is None:
        logger.warning(f"Unsupported mimetype: {mimetype}")
        return {
            "parsers": parsers,
            "embedders": embedders,
            "thumbnailers": thumbnailers,
            "post_processors": post_processors,
        }

    # Get compatible parsers
    for parser_class in get_all_parsers():
        if mimetype_enum in parser_class.supported_file_types:
            module_name = parser_class.__module__.split(".")[-1]
            if detailed:
                parsers.append(
                    {
                        "class": parser_class,
                        "module_name": module_name,
                        "title": parser_class.title,
                        "description": parser_class.description,
                        "author": parser_class.author,
                        "input_schema": parser_class.input_schema,
                    }
                )
            else:
                parsers.append(parser_class)

    # Get compatible embedders (assuming embedders work on text output)
    for embedder_class in get_all_embedders():
        module_name = embedder_class.__module__.split(".")[-1]
        if detailed:
            embedders.append(
                {
                    "class": embedder_class,
                    "title": embedder_class.title,
                    "module_name": module_name,
                    "description": embedder_class.description,
                    "author": embedder_class.author,
                    "vector_size": embedder_class.vector_size,
                    "input_schema": embedder_class.input_schema,
                }
            )
        else:
            embedders.append(embedder_class)

    # Get compatible thumbnailers
    for thumbnailer_class in get_all_thumbnailers():
        if mimetype_enum in thumbnailer_class.supported_file_types:
            module_name = thumbnailer_class.__module__.split(".")[-1]
            if detailed:
                thumbnailers.append(
                    {
                        "class": thumbnailer_class,
                        "module_name": module_name,
                        "title": thumbnailer_class.title,
                        "description": thumbnailer_class.description,
                        "author": thumbnailer_class.author,
                        "input_schema": thumbnailer_class.input_schema,
                    }
                )
            else:
                thumbnailers.append(thumbnailer_class)

    # Get compatible post-processors
    for post_processor_class in get_all_post_processors():
        if mimetype_enum in post_processor_class.supported_file_types:
            logger.info(post_processor_class)
            logger.info(dir(post_processor_class))
            module_name = post_processor_class.__module__.split(".")[-1]
            post_processors.append(
                {
                    "class": post_processor_class,
                    "title": post_processor_class.title,
                    "module_name": module_name,
                    "description": post_processor_class.description,
                    "author": post_processor_class.author,
                    "input_schema": post_processor_class.input_schema,
                }
            )

    return {
        "parsers": parsers,
        "embedders": embedders,
        "thumbnailers": thumbnailers,
        "post_processors": post_processors,
    }


def get_metadata_for_component(component_class: type) -> dict[str, Any]:
    """
    Given a component class, return its metadata.

    Args:
        component_class (Type): The component class.

    Returns:
        Dict[str, Any]: Dictionary of metadata.
    """

    module_name = component_class.__module__.split(".")[-1]
    metadata = {
        "title": component_class.title,
        "module_name": module_name,
        "description": component_class.description,
        "author": component_class.author,
        "dependencies": component_class.dependencies,
        "input_schema": component_class.input_schema,
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
    if "." in component_name:
        try:
            module_path, class_name = component_name.rsplit(".", 1)
            module = importlib.import_module(module_path)
            for name, obj in inspect.getmembers(module, inspect.isclass):
                if name == class_name and (
                    issubclass(obj, BaseParser)
                    or issubclass(obj, BaseEmbedder)
                    or issubclass(obj, BaseThumbnailGenerator)
                    or issubclass(obj, BasePostProcessor)
                ):
                    return obj
        except (ModuleNotFoundError, AttributeError):
            pass

    # Original implementation for script name only
    base_paths = [
        "opencontractserver.pipeline.parsers",
        "opencontractserver.pipeline.embedders",
        "opencontractserver.pipeline.thumbnailers",
        "opencontractserver.pipeline.post_processors",
    ]

    for base_path in base_paths:
        try:
            module = importlib.import_module(f"{base_path}.{component_name}")
            for name, obj in inspect.getmembers(module, inspect.isclass):
                if (
                    (issubclass(obj, BaseParser) and obj != BaseParser)
                    or (issubclass(obj, BaseEmbedder) and obj != BaseEmbedder)
                    or (
                        issubclass(obj, BaseThumbnailGenerator)
                        and obj != BaseThumbnailGenerator
                    )
                    or (issubclass(obj, BasePostProcessor) and obj != BasePostProcessor)
                ):
                    return obj
        except ModuleNotFoundError:
            continue

    raise ValueError(f"Component '{component_name}' not found.")


def get_preferred_embedder(mimetype: str) -> Optional[type[BaseEmbedder]]:
    """
    Get the preferred embedder class for a given mimetype.

    Args:
        mimetype (str): The mimetype of the file.

    Returns:
        Optional[Type[BaseEmbedder]]: The preferred embedder class, or None if not found.
    """
    embedder_path = settings.PREFERRED_EMBEDDERS.get(mimetype)
    if embedder_path:
        try:
            module_path, class_name = embedder_path.rsplit(".", 1)
            module = importlib.import_module(module_path)
            embedder_class = getattr(module, class_name)
            return embedder_class
        except (ModuleNotFoundError, AttributeError) as e:
            logger.error(f"Error loading embedder '{embedder_path}': {e}")
            return None
    else:
        logger.warning(f"No preferred embedder set for mimetype: {mimetype}")
        return None


def get_default_embedder() -> Optional[type[BaseEmbedder]]:
    """
    Get the default embedder class.

    Returns:
        Optional[Type[BaseEmbedder]]: The default embedder class, or None if not found.
    """
    embedder_path = settings.DEFAULT_EMBEDDER
    if embedder_path:
        try:
            module_path, class_name = embedder_path.rsplit(".", 1)
            module = importlib.import_module(module_path)
            embedder_class = getattr(module, class_name)
            return embedder_class
        except (ModuleNotFoundError, AttributeError) as e:
            logger.error(f"Error loading default embedder '{embedder_path}': {e}")
            return None
    else:
        logger.error("No default embedder specified in settings")
        return None


def get_embedder_by_dimension(dimension: int) -> Optional[type[BaseEmbedder]]:
    """
    Get a fallback embedder class for a specific dimension.

    Args:
        dimension (int): The embedding dimension (e.g., 384, 768, 1536, 3072)

    Returns:
        Optional[Type[BaseEmbedder]]: A fallback embedder class for the specified dimension, 
        or None if not found.
    """
    # This function is deprecated and should not be used
    logger.warning("get_embedder_by_dimension is deprecated. Use get_default_embedder_for_filetype_and_dimension instead.")
    return get_default_embedder()


def get_default_embedder_for_filetype_and_dimension(
    mimetype: str, 
    dimension: int
) -> Optional[type[BaseEmbedder]]:
    """
    Get the default embedder for a specific filetype and dimension.
    
    Args:
        mimetype: The MIME type of the file
        dimension: The desired embedding dimension
        
    Returns:
        Optional[Type[BaseEmbedder]]: The default embedder for the specified filetype and dimension,
        or None if not found
    """
    # Get the default embedders for the mimetype
    filetype_embedders = settings.DEFAULT_EMBEDDERS_BY_FILETYPE_AND_DIMENSION.get(mimetype, {})
    
    # Get the embedder for the specified dimension
    embedder_path = filetype_embedders.get(dimension)
    
    if embedder_path:
        try:
            module_path, class_name = embedder_path.rsplit(".", 1)
            module = importlib.import_module(module_path)
            embedder_class = getattr(module, class_name)
            return embedder_class
        except (ModuleNotFoundError, AttributeError) as e:
            logger.error(f"Error loading embedder '{embedder_path}': {e}")
            return None
    else:
        logger.warning(f"No default embedder found for mimetype '{mimetype}' and dimension {dimension}")
        return None


def find_embedders_by_dimension(dimension: int) -> list[type[BaseEmbedder]]:
    """
    Find all available embedders for a specific dimension.

    Args:
        dimension (int): The embedding dimension to search for

    Returns:
        list[Type[BaseEmbedder]]: List of embedder classes with the specified dimension
    """
    all_embedders = get_all_embedders()
    matching_embedders = [
        embedder for embedder in all_embedders 
        if hasattr(embedder, 'vector_size') and embedder.vector_size == dimension
    ]
    
    return matching_embedders


def get_dimension_from_embedder(embedder_class_or_path: Union[type[BaseEmbedder], str]) -> int:
    """
    Get the dimension from an embedder class or path.

    Args:
        embedder_class_or_path: Either an embedder class or a path to an embedder class

    Returns:
        int: The dimension of the embedder, or the default dimension if not found
    """
    from django.conf import settings
    
    default_dim = getattr(settings, 'DEFAULT_EMBEDDING_DIMENSION', 768)
    
    if isinstance(embedder_class_or_path, str):
        try:
            embedder_class = get_component_by_name(embedder_class_or_path)
        except ValueError:
            logger.error(f"Could not find embedder class: {embedder_class_or_path}")
            return default_dim
    else:
        embedder_class = embedder_class_or_path
    
    if embedder_class and hasattr(embedder_class, 'vector_size'):
        return embedder_class.vector_size
    
    return default_dim


def find_embedder_for_filetype_and_dimension(
    mimetype: str, 
    dimension: int = None
) -> Optional[type[BaseEmbedder]]:
    """
    Find an appropriate embedder for a specific file type and dimension.
    
    Args:
        mimetype: The MIME type of the file
        dimension: The desired embedding dimension (optional)
        
    Returns:
        Optional[Type[BaseEmbedder]]: An appropriate embedder class, or None if not found
    """
    # If no dimension is specified, just return the preferred embedder for the mimetype
    if dimension is None:
        return get_preferred_embedder(mimetype)
    
    # If a dimension is specified, try to get the default embedder for that filetype and dimension
    embedder = get_default_embedder_for_filetype_and_dimension(mimetype, dimension)
    if embedder:
        return embedder
    
    # If no specific embedder is found, fall back to the preferred embedder for the mimetype
    preferred_embedder = get_preferred_embedder(mimetype)
    if preferred_embedder:
        return preferred_embedder
    
    # Last resort: return the default embedder
    return get_default_embedder()


def run_post_processors(
    processor_paths: list[str],
    zip_bytes: bytes,
    export_data: OpenContractsExportDataJsonPythonType,
    input_kwargs: dict[str, Any] = {},
) -> tuple[bytes, OpenContractsExportDataJsonPythonType]:
    """
    Load and run post-processors in sequence.

    Args:
        processor_paths: List of fully qualified Python paths to post-processor classes
        zip_bytes: The raw bytes of the zip file being created
        export_data: The export data dictionary that will be serialized to data.json

    Returns:
        Tuple containing:
            - Modified zip bytes
            - Modified export data dictionary
    """
    current_zip_bytes = zip_bytes
    current_export_data = export_data

    for path in processor_paths:
        try:
            logger.info(f"Loading post-processor: {path}")
            processor_class = get_component_by_name(path)
            logger.debug(f"Initializing post-processor {processor_class.__name__}")
            processor = processor_class()
            logger.info(f"Running post-processor: {processor.title}")
            current_zip_bytes, current_export_data = processor.process_export(
                current_zip_bytes, current_export_data, **input_kwargs
            )
            logger.debug(f"Completed post-processor: {processor.title}")
        except Exception as e:
            logger.error(f"Error running post-processor {path}: {str(e)}")
            raise

    return current_zip_bytes, current_export_data
