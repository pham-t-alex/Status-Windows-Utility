$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Definition
node (Join-Path $scriptDirectory 'bin\agent-windows.js') @args
exit $LASTEXITCODE
