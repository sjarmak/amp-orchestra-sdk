# Test Toolbox for Amp Orchestra

This is a test toolbox containing sample tools for testing the toolbox functionality.

## Tools Available

- **hello-amp** - Simple greeting tool that shows environment info
- **test-json** - Outputs structured JSON for testing
- **list-files** - Lists files in the current directory

## Usage

1. Select this directory (`/Users/sjarmak/amp-orchestra/test-toolbox`) as your toolbox path in the Amp Orchestra UI
2. Enable toolboxes by setting `AMP_ENABLE_TOOLBOXES=1`
3. Create a new chat session
4. The tools should be available in the PATH

## Testing

You can test the tools work by running them directly:

```bash
./test-toolbox/bin/hello-amp
./test-toolbox/bin/test-json
./test-toolbox/bin/list-files
```
