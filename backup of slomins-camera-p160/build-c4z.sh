#!/bin/bash

# Build script for Slomins P160 Camera Driver
# Creates a .c4z file (which is just a zip archive)

DRIVER_NAME="Slomins-indoor-P160"
OUTPUT_FILE="${DRIVER_NAME}.c4z"

echo "Building ${DRIVER_NAME}.c4z..."

# Remove old c4z file if it exists
if [ -f "$OUTPUT_FILE" ]; then
    echo "Removing old ${OUTPUT_FILE}..."
    rm "$OUTPUT_FILE"
fi

# Create the c4z archive (zip format)
# Include all necessary files
echo "Creating archive..."
zip -r "$OUTPUT_FILE" \
    driver.lua \
    driver.xml \
    mqtt_manager.lua \
    CldBusApi/ \
    www/ \
    -x "*.git*" "*.DS_Store" "*/__pycache__/*" "*.pyc"

if [ $? -eq 0 ]; then
    echo "✓ Successfully built ${OUTPUT_FILE}"
    ls -lh "$OUTPUT_FILE"
else
    echo "✗ Build failed"
    exit 1
fi
