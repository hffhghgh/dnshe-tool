#!/bin/bash
set -e

rm -f dnshe-tool-1.0.0.tgz

# Linux ARM64
npm_config_platform=linux npm_config_arch=arm64 npm install
npm pack --pack-destination .
mv dnshe-tool-1.0.0.tgz dnshe-tool-linux-arm64.tgz

# Linux x86_64
npm_config_platform=linux npm_config_arch=x64 npm install
npm pack --pack-destination .
mv dnshe-tool-1.0.0.tgz dnshe-tool-linux-x64.tgz

echo "Packages generated:"
ls -lh dnshe-tool-linux-*.tgz
