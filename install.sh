#!/bin/bash
set -e

install_package() {
    local archive="$1"
    local temp_dir

    temp_dir=$(mktemp -d)

    echo "Extracting $archive..."
    tar -xzf "$archive" -C "$temp_dir"

    # Find executable
    if [ -f "$temp_dir/package/debian-package/usr/bin/dnshe-tool" ]; then
        sudo install -m 755 \
            "$temp_dir/package/debian-package/usr/bin/dnshe-tool" \
            /usr/local/bin/dnshe-tool
    else
        echo "Executable not found in $archive"
        rm -rf "$temp_dir"
        return 1
    fi

    # Install application files
    sudo mkdir -p /usr/local/lib/dnshe-tool
    sudo cp -a \
        "$temp_dir/package/debian-package/usr/lib/dnshe-tool/." \
        /usr/local/lib/dnshe-tool/

    rm -rf "$temp_dir"
    echo "Installed $archive"
}

ARCH=$(uname -m)

case "$ARCH" in
    aarch64|arm64)
        install_package dnshe-tool-linux-arm64.tgz
        ;;
    x86_64)
        install_package dnshe-tool-linux-x64.tgz
        ;;
    *)
        echo "Unsupported architecture: $ARCH"
        exit 1
        ;;
esac

echo "Installation complete!"
dnshe-tool --help
