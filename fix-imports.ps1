# Script para agregar extensiones .js a todas las importaciones relativas en archivos TypeScript
$srcPath = "src"
$files = Get-ChildItem -Path $srcPath -Filter "*.ts" -Recurse | Where-Object { 
    $_.FullName -notlike "*\generated\*" -and 
    $_.FullName -notlike "*\node_modules\*" 
}

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    $originalContent = $content
    
    # Reemplazar importaciones relativas sin extensión
    # Patrón: from './ruta' o from '../ruta' pero no from './ruta.js' o from '../ruta.js'
    $content = $content -replace "from\s+['""](\.\.?\/[^'""]+)(?<!\.js)['""]", { 
        $path = $_.Groups[1].Value
        # Solo agregar .js si no termina en .ts, .tsx, .js, .jsx, .json
        if ($path -notmatch '\.(ts|tsx|js|jsx|json)$') {
            "from '$path.js'"
        } else {
            $_.Value
        }
    }
    
    # También manejar import type
    $content = $content -replace "import\s+type\s+.*\s+from\s+['""](\.\.?\/[^'""]+)(?<!\.js)['""]", {
        $path = $_.Groups[1].Value
        if ($path -notmatch '\.(ts|tsx|js|jsx|json)$') {
            $_.Value -replace "['""](\.\.?\/[^'""]+)(?<!\.js)['""]", "'$path.js'"
        } else {
            $_.Value
        }
    }
    
    if ($content -ne $originalContent) {
        Set-Content -Path $file.FullName -Value $content -NoNewline
        Write-Host "Actualizado: $($file.FullName)"
    }
}

Write-Host "`nProceso completado."
