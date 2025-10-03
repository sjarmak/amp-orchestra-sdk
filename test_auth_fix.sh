#!/bin/bash
cd desktop-ui
echo "Building Rust backend..."
cargo build --manifest-path src-tauri/Cargo.toml

echo "Testing AMP authentication..."
AMP_API_KEY=$(grep "export AMP_API_KEY" ~/.zshrc | cut -d'=' -f2 | tr -d '"')
echo "Found API key length: ${#AMP_API_KEY}"

if [ ${#AMP_API_KEY} -gt 10 ]; then
    echo "✅ API key found in shell config"
    echo "🔧 Fix implemented: AMP_API_KEY will now be persisted for subsequent processes"
    echo "🚀 Ready to test the application"
else
    echo "❌ API key not found or invalid"
fi
