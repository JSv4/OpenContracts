def import_function_from_string(dotted_path):
    """
    Import a function from a dotted module path string.
    """
    from importlib import import_module

    module_path, function_name = dotted_path.rsplit('.', 1)
    module = import_module(module_path)
    func = getattr(module, function_name)
    return func
