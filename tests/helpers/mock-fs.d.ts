/**
 * Create a temporary directory for a test.
 * The directory is automatically tracked for cleanup.
 *
 * @param prefix - Directory name prefix (default: "osai-test-")
 * @returns Absolute path to the created temporary directory
 */
export declare function createTempDir(prefix?: string): string;
/**
 * Create a temporary file with the given content.
 *
 * @param content - File content to write
 * @param prefix - File name prefix (default: "osai-test-")
 * @param extension - File extension (default: ".tmp")
 * @returns Absolute path to the created temporary file
 */
export declare function createTempFile(content: string, prefix?: string, extension?: string): string;
/**
 * Remove a specific temporary directory and all its contents.
 *
 * @param dirPath - Absolute path to the directory to remove
 */
export declare function removeTempDir(dirPath: string): void;
/**
 * Cleanup all tracked temporary directories.
 * Called automatically in afterEach/afterAll via tests/setup.ts.
 */
export declare function cleanupTempDirs(): void;
/**
 * Create a mock directory structure within a given base path.
 *
 * @param basePath - Root directory for the structure
 * @param structure - Object describing the file tree:
 *   - string value: file with that content
 *   - null value: empty directory
 */
export declare function createMockStructure(basePath: string, structure: Record<string, string | null>): void;
//# sourceMappingURL=mock-fs.d.ts.map