#!/bin/bash

# Build script for Slomins VD05 Video Doorbell Driver
# Creates a .c4z file (which is just a zip archive)

DRIVER_NAME="Slomins-doorbell-VD05"
OUTPUT_FILE="${DRIVER_NAME}.c4z"

echo "Building ${DRIVER_NAME}.c4z..."

# Remove old c4z file if it exists
if [ -f "$OUTPUT_FILE" ]; then
    echo "Removing old ${OUTPUT_FILE}..."
    rm "$OUTPUT_FILE"
fi

# Verify critical files exist
if [ ! -f "driver.lua" ]; then
    echo "✗ Error: driver.lua not found"
    exit 1
fi

if [ ! -f "driver.xml" ]; then
    echo "✗ Error: driver.xml not found"
    exit 1
fi

if [ ! -d "www" ]; then
    echo "⚠ Warning: www/ folder not found - web UI will not work!"
fi

# Create the c4z archive (zip format)
# Include all necessary files
echo "Creating archive..."
zip -r "$OUTPUT_FILE" \
    driver.lua \
    driver.xml \
    event_logger.lua \
    mqtt_manager.lua \
    CldBusApi/ \
    www/ \
    -x "*.git*" "*.DS_Store" "*/__pycache__/*" "*.pyc" "*.bak" "*~"

if [ $? -eq 0 ]; then
    echo "✓ Successfully built ${OUTPUT_FILE}"
    echo ""
    echo "Package contents:"
    unzip -l "$OUTPUT_FILE" | head -20
    echo ""
    echo "File size:"
    ls -lh "$OUTPUT_FILE"
    echo ""
    echo "✓ Ready to install in Composer Pro"
else
    echo "✗ Build failed"
    exit 1
fi
