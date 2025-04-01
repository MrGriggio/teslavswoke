#!/bin/bash

# Build the project
npm run build

# Create a temporary folder
mkdir -p .deploy

# Copy the built files to the temporary folder
cp -r dist/* .deploy/

# Switch to gh-pages branch
git checkout gh-pages

# Remove existing files (except .git directory)
find . -maxdepth 1 ! -name '.git' ! -name '.' ! -name '.deploy' -exec rm -rf {} \;

# Copy built files to the root
cp -r .deploy/* .

# Remove the temporary folder
rm -rf .deploy

# Add all files
git add .

# Commit the changes
git commit -m "Updated GitHub Pages"

# Push the changes
git push origin gh-pages

# Go back to the main branch
git checkout main

echo "Deployment completed!" 