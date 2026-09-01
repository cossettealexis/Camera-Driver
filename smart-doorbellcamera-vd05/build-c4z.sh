#!/bin/bash

# Build script for Slomins-doorbell-VD05.c4z

echo "Building Slomins-doorbell-VD05.c4z..."

# Remove old archive
echo "Removing old Slomins-doorbell-VD05.c4z..."
rm -f Slomins-doorbell-VD05.c4z

# Create archive
echo "Creating archive..."
zip -r Slomins-doorbell-VD05.c4z \
    driver.lua \
    driver.xml \
    mqtt_manager.lua \
    event_logger.lua \
    CldBusApi/ \
    www/ \
    -x "*.DS_Store" \
    -x "*/.git/*" \
    -x "*.c4z" \
    -x "*.md" \
    -x "*.pdf"

# Check if successful
if [ -f "Slomins-doorbell-VD05.c4z" ]; then
    echo "✓ Successfully built Slomins-doorbell-VD05.c4z"
    ls -lh Slomins-doorbell-VD05.c4z
else
    echo "✗ Build failed"
    exit 1
fi
