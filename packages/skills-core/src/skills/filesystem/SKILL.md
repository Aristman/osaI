# Filesystem Skill

Bundled skill providing 7 filesystem tools for the osaI agent.
Programmatically defined -- this file is documentation only.

## Tools

### read_file
Read file content from the local filesystem.
Permission: auto

### write_file
Create or overwrite a file on the local filesystem.
Permission: confirm

### list_dir
List entries in a directory.
Permission: auto

### search_files
Search for files matching a glob pattern.
Permission: auto

### move_file
Move or rename a file or directory.
Permission: confirm

### delete_file
Delete a file from the local filesystem.
Permission: confirm

### get_file_info
Get file metadata (size, mtime, type).
Permission: auto
