# Ignore-rule snapshot before excluding regenerable local audit outputs

`gitignore.before` preserves the tracked ignore rules before adding `tmp/`. The local `tmp/` folder contains regenerable audit JSON and PDF page crops, not maintained source files or canonical reports. Ignoring it keeps machine output out of commits; the analysis scripts and Markdown reports remain versioned.
