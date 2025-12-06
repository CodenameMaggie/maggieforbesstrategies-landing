#!/bin/bash

echo "🎨 Integrating Premium Widget into Dashboard..."
echo ""

# Backup current dashboard
cp public/dashboard.html public/dashboard-backup-$(date +%Y%m%d-%H%M%S).html
echo "✅ Backed up current dashboard"

# Create Python script to do the integration
cat > /tmp/integrate_widget.py << 'PYTHON_SCRIPT'
import re

# Read dashboard
with open('public/dashboard.html', 'r') as f:
    dashboard = f.read()

# Read premium widget
with open('/Users/Kristi/Desktop/mfs-dashboard-updated.html', 'r') as f:
    widget_file = f.read()

# Extract parts from widget file
# 1. Extract HTML (lines 5-94)
widget_html_match = re.search(r'<div class="pipeline-section"[^>]*>.*?</div>\s*</div>\s*</style>', widget_file, re.DOTALL)
widget_html = widget_html_match.group(0) if widget_html_match else ''

# 2. Extract CSS (between style tags)
css_match = re.search(r'<style>(.*?)</style>', widget_file, re.DOTALL)
widget_css = css_match.group(1) if css_match else ''

# 3. Extract JavaScript
js_match = re.search(r'<script>(.*?)</script>', widget_file, re.DOTALL)
widget_js = js_match.group(1) if js_match else ''

# Replace old widget HTML
old_widget_pattern = r'<!-- AI Automation Widget - Integrated -->.*?</div>\s*</div>'
dashboard = re.sub(old_widget_pattern, widget_html.split('</style>')[0], dashboard, flags=re.DOTALL)

# Add premium CSS before </style>
dashboard = re.sub(r'(</style>)', widget_css + r'\1', dashboard, 1)

# Replace widget JavaScript functions
# Find and replace loadAutomationWidget, loadWidgetStats, loadWidgetActivityFeed, refreshAutomationWidget
dashboard = re.sub(
    r'async function loadAutomationWidget\(\).*?}\s*(?=async function|function [a-z]|</script>)',
    widget_js,
    dashboard,
    flags=re.DOTALL
)

# Write updated dashboard
with open('public/dashboard.html', 'w') as f:
    f.write(dashboard)

print("✅ Integration complete!")
PYTHON_SCRIPT

# Run Python script
python3 /tmp/integrate_widget.py

echo ""
echo "✨ Premium widget integrated successfully!"
echo "📝 Original dashboard backed up to public/dashboard-backup-*.html"
echo ""
echo "Next steps:"
echo "1. Test locally: open public/dashboard.html in browser"
echo "2. Push to Railway: git add public/dashboard.html && git commit -m 'Integrate premium widget' && git push"
