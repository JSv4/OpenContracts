#!/bin/sh

# =====================================
# Environment Configuration Generator
# =====================================
#
# This script generates a JavaScript file (env-config.js) containing environment
# configuration. It handles two scenarios:
#
# 1. If a .env file exists:
#    - Reads the .env file
#    - For each key-value pair, checks if an environment variable with the same name exists
#    - Uses the environment variable value if it exists, otherwise uses the value from .env
#
# 2. If no .env file exists:
#    - Scans all environment variables
#    - Processes variables starting with OPEN_CONTRACTS_
#    - Removes the OPEN_CONTRACTS_ prefix from the variable name
#    - Uses the remaining part as the key in the output
#
# The resulting env-config.js file will contain a JavaScript object named window._env_
# with all the processed environment variables.
#
# Usage:
#   Run this script in the directory where you want env-config.js to be generated.
#   Ensure it has execute permissions (chmod +x script_name.sh)
#
# Note: This script assumes the presence of standard Unix utilities (echo, awk, grep, etc.)

# Start the JavaScript object in env-config.js
# This line overwrites any existing content in env-config.js
echo "window._env_ = {" > ./env-config.js

# Check if .env file exists
if [ -f ./.env ]; then
    # ==================================
    # Process existing .env file
    # ==================================
    #
    # Use awk to read the .env file and process each line:
    # - Set field separator to '='
    # - For each line, print the key (before '=') followed by a colon
    # - Check if an environment variable with the same name exists
    #   - If it does, use its value
    #   - If not, use the value from the .env file
    # - Format the output as a JavaScript object property
    # - Append the result to env-config.js
    awk -F '=' '{
        print $1 ": \"" (ENVIRON[$1] ? ENVIRON[$1] : $2) "\","
    }' ./.env >> ./env-config.js
else
    echo "Debug: No .env file found, checking environment variables"
    # =======================================
    # Process environment variables directly
    # =======================================
    #
    # If no .env file exists, process environment variables:
    # - Use 'env' to list all environment variables
    # - Filter for variables starting with OPEN_CONTRACTS_
    # - For each matching variable:
    #   - Remove the OPEN_CONTRACTS_ prefix
    #   - Add the cleaned key and its value to env-config.js
    env | grep '^OPEN_CONTRACTS_' | while IFS='=' read -r key value; do
        # Remove OPEN_CONTRACTS_ prefix
        cleaned_key=${key#OPEN_CONTRACTS_}
        # Add to env-config.js, formatting as a JavaScript object property
        echo "  $cleaned_key: \"$value\"," >> ./env-config.js
    done
fi

# Close the JavaScript object in env-config.js
echo "}" >> ./env-config.js

echo "Debug: Final contents of env-config.js:"
cat ./env-config.js

echo "Debug: env.sh script completed"

# =====================================
# Script Completion
# =====================================
#
# At this point, env-config.js should contain a valid JavaScript object
# with all the necessary environment configurations.
#
# The resulting file can be included in your JavaScript application
# to access these environment variables at runtime.
