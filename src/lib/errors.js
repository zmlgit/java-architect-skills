/**
 * Error Handling Utilities
 * Custom error types and error handling helpers
 */

/**
 * Custom error types
 */
export class JavaArchitectError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class FileError extends JavaArchitectError {
  constructor(message, filePath, details) {
    super(message, "FILE_ERROR", { ...details, filePath });
    this.filePath = filePath;
  }
}

export class ParseError extends JavaArchitectError {
  constructor(message, filePath, line = null) {
    super(message, "PARSE_ERROR", { filePath, line });
    this.filePath = filePath;
    this.line = line;
  }
}

export class AnalysisError extends JavaArchitectError {
  constructor(message, targetPath, details) {
    super(message, "ANALYSIS_ERROR", { ...details, targetPath });
    this.targetPath = targetPath;
  }
}

export class ConfigError extends JavaArchitectError {
  constructor(message, configPath) {
    super(message, "CONFIG_ERROR", { configPath });
    this.configPath = configPath;
  }
}

/**
 * Error codes and their user-friendly messages
 */
export const ErrorCodes = {
  FILE_NOT_FOUND: "FILE_NOT_FOUND",
  FILE_NOT_READABLE: "FILE_NOT_READABLE",
  INVALID_JAVA: "INVALID_JAVA",
  PARSE_FAILED: "PARSE_FAILED",
  ANALYSIS_FAILED: "ANALYSIS_FAILED",
  CONFIG_INVALID: "CONFIG_INVALID",
  CACHE_ERROR: "CACHE_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR"
};

/**
 * Error message templates
 */
export const ErrorMessages = {
  [ErrorCodes.FILE_NOT_FOUND]: (filePath) =>
    `File not found: ${filePath}`,

  [ErrorCodes.FILE_NOT_READABLE]: (filePath) =>
    `Cannot read file: ${filePath}`,

  [ErrorCodes.INVALID_JAVA]: (filePath) =>
    `Invalid Java syntax in: ${filePath}`,

  [ErrorCodes.PARSE_FAILED]: (filePath, reason) =>
    `Failed to parse ${filePath}: ${reason}`,

  [ErrorCodes.ANALYSIS_FAILED]: (targetPath, reason) =>
    `Analysis failed for ${targetPath}: ${reason}`,

  [ErrorCodes.CONFIG_INVALID]: (configPath, reason) =>
    `Invalid config in ${configPath}: ${reason}`,

  [ErrorCodes.CACHE_ERROR]: (operation) =>
    `Cache error during ${operation}`,

  [ErrorCodes.NETWORK_ERROR]: (url) =>
    `Network error downloading from ${url}`
};

/**
 * Safely execute a function with error handling
 */
export async function safeExecute(fn, context = {}) {
  try {
    return await fn();
  } catch (error) {
    return handleError(error, context);
  }
}

/**
 * Handle errors with appropriate logging and user messages
 */
export function handleError(error, context = {}) {
  // If it's our custom error, use it directly
  if (error instanceof JavaArchitectError) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      }
    };
  }

  // Handle system errors
  if (error.code === "ENOENT") {
    return {
      success: false,
      error: {
        code: ErrorCodes.FILE_NOT_FOUND,
        message: ErrorMessages[ErrorCodes.FILE_NOT_FOUND](context.filePath || error.path),
        details: { originalError: error.message }
      }
    };
  }

  if (error.code === "EACCES") {
    return {
      success: false,
      error: {
        code: ErrorCodes.FILE_NOT_READABLE,
        message: ErrorMessages[ErrorCodes.FILE_NOT_READABLE](context.filePath || error.path),
        details: { originalError: error.message }
      }
    };
  }

  // Generic error handler
  return {
    success: false,
    error: {
      code: "UNKNOWN_ERROR",
      message: error.message || "An unknown error occurred",
      details: { context }
    }
  };
}

/**
 * Validate file exists and is readable
 */
export function validateFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      throw new FileError(
        ErrorMessages[ErrorCodes.FILE_NOT_FOUND](filePath),
        filePath
      );
    }

    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      throw new FileError(
        `Path is not a file: ${filePath}`,
        filePath
      );
    }

    // Try to read to verify accessibility
    fs.accessSync(filePath, fs.constants.R_OK);

    return true;
  } catch (error) {
    if (error instanceof FileError) {
      throw error;
    }
    throw new FileError(
      ErrorMessages[ErrorCodes.FILE_NOT_READABLE](filePath),
      filePath
    );
  }
}

/**
 * Validate directory exists and is accessible
 */
export function validateDirectory(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      throw new FileError(
        `Directory not found: ${dirPath}`,
        dirPath
      );
    }

    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
      throw new FileError(
        `Path is not a directory: ${dirPath}`,
        dirPath
      );
    }

    fs.accessSync(dirPath, fs.constants.R_OK);

    return true;
  } catch (error) {
    if (error instanceof FileError) {
      throw error;
    }
    throw new FileError(
      `Cannot access directory: ${dirPath}`,
      dirPath
    );
  }
}

/**
 * Retry wrapper for flaky operations
 */
export async function retry(fn, options = {}) {
  const {
    maxAttempts = 3,
    delay = 1000,
    backoff = 2,
    context = "operation"
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) {
        break;
      }

      const waitTime = delay * Math.pow(backoff, attempt - 1);
      console.warn(`Retry ${attempt}/${maxAttempts} for ${context} after ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  throw new AnalysisError(
    `${context} failed after ${maxAttempts} attempts`,
    context,
    { originalError: lastError?.message }
  );
}
