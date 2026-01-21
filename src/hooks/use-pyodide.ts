"use client";

import { useState, useEffect, useCallback, useRef } from 'react';

type ExecutionResult = {
  success: boolean;
  output?: string;
  error?: string;
  executionTime?: number;
};

type PyodidePackageName = string | string[];

interface PyodideGlobals {
  get: (name: string) => unknown;
}

interface PyodideInstance {
  runPythonAsync: (code: string) => Promise<unknown>;
  loadPackage: (packageName: PyodidePackageName) => Promise<unknown>;
  globals: PyodideGlobals;
}

type LoadPyodideFn = (config: { indexURL: string }) => Promise<PyodideInstance>;

declare global {
  interface Window {
    loadPyodide?: LoadPyodideFn;
  }
}

const LOCAL_PYODIDE_BASE_URL = '/pyodide/v0.28.3/full/';
const DEFAULT_CDN_PYODIDE_BASE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.28.3/full/';
const normalizeBaseUrl = (value: string): string =>
  value.endsWith('/') ? value : `${value}/`;
const configuredBaseUrl = normalizeBaseUrl(
  process.env.NEXT_PUBLIC_PYODIDE_BASE_URL ?? LOCAL_PYODIDE_BASE_URL,
);
const fallbackBaseUrl = normalizeBaseUrl(
  process.env.NEXT_PUBLIC_PYODIDE_CDN_BASE_URL ?? DEFAULT_CDN_PYODIDE_BASE_URL,
);
const pyodideBaseUrlCandidates = Array.from(
  new Set([configuredBaseUrl, fallbackBaseUrl].filter(Boolean)),
);

const getPyodideScriptSrc = (baseUrl: string): string => `${baseUrl}pyodide.js`;

const loadPyodideScript = async (baseUrl: string): Promise<void> => {
  const scriptSrc = getPyodideScriptSrc(baseUrl);

  const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${scriptSrc}"]`);
  if (existingScript) {
    if (existingScript.getAttribute('data-loaded') === 'true') {
      return;
    }
    if (window.loadPyodide) {
      return;
    }
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = scriptSrc;
    script.async = true;

    const cleanup = () => {
      if (script.parentElement) {
        script.parentElement.removeChild(script);
      }
    };

    script.onload = () => {
      script.setAttribute('data-loaded', 'true');
      resolve();
    };

    script.onerror = () => {
      cleanup();
      reject(new Error(`Failed to load Pyodide script from ${scriptSrc}`));
    };

    document.head.appendChild(script);
  });
};

const ensurePyodideScriptLoaded = async (): Promise<string> => {
  if (window.loadPyodide) {
    return pyodideBaseUrlCandidates[0];
  }

  let lastError: Error | null = null;
  for (const baseUrl of pyodideBaseUrlCandidates) {
    try {
      await loadPyodideScript(baseUrl);
      return baseUrl;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error('Failed to load Pyodide script');
};

type UsePyodideOptions = {
  autoInit?: boolean;
};

export function usePyodide(options: UsePyodideOptions = {}) {
  const { autoInit = true } = options;
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(autoInit);
  const [error, setError] = useState<string | null>(null);
  const [shouldInit, setShouldInit] = useState(autoInit);
  const pyodideRef = useRef<PyodideInstance | null>(null);
  const initRequestedRef = useRef(false);
  const micropipLoadedRef = useRef(false);

  useEffect(() => {
    if (autoInit) {
      setShouldInit(true);
    }
  }, [autoInit]);

  useEffect(() => {
    if (!shouldInit || pyodideRef.current || initRequestedRef.current) {
      if (!shouldInit && !pyodideRef.current) {
        setIsLoading(false);
      }
      return;
    }

    initRequestedRef.current = true;
    let mounted = true;

    const initPyodide = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Set a timeout for initialization (60 seconds - Pyodide is heavy)
        const timeoutId = setTimeout(() => {
          if (mounted) {
            setError('Pyodide initialization timed out (60s). Your internet connection might be slow or CDN is unavailable.');
            setIsLoading(false);
            initRequestedRef.current = false;
          }
        }, 60000);

        const scriptBaseUrl = await ensurePyodideScriptLoaded();

        if (!mounted) {
          clearTimeout(timeoutId);
          return;
        }

        const loadPyodide = window.loadPyodide;
        if (!loadPyodide) {
          throw new Error(`Pyodide loader not available after loading script from ${scriptBaseUrl}`);
        }

        const packageBaseUrl =
          scriptBaseUrl === configuredBaseUrl ? fallbackBaseUrl : scriptBaseUrl;

        const pyodide = await loadPyodide({
          indexURL: scriptBaseUrl,
          packageBaseUrl,
        });

        if (!mounted) {
          clearTimeout(timeoutId);
          return;
        }

        // Load commonly used packages
        const commonPackages = ['numpy', 'pandas'];
        const packagesLiteral = JSON.stringify(commonPackages);

        const installCommonPackages = async () => {
          try {
            await pyodide.loadPackage(commonPackages);
            return;
          } catch (packageError) {
            console.warn(
              'Failed to load Pyodide packages via loadPackage, falling back to micropip',
              packageError,
            );
          }

          await pyodide.loadPackage('micropip');
          await pyodide.runPythonAsync(`
import json
import micropip
import asyncio

async def _install():
    packages = json.loads('${packagesLiteral}')
    for pkg in packages:
        await micropip.install(pkg)

asyncio.run(_install())
`);
        };

        await installCommonPackages();

        if (!mounted) {
          clearTimeout(timeoutId);
          return;
        }

        clearTimeout(timeoutId);
        pyodideRef.current = pyodide;
        setIsReady(true);
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to initialize Pyodide:', err);
        if (mounted) {
          const errorMessage = err instanceof Error 
            ? err.message 
            : 'Failed to initialize Pyodide. Please check your internet connection and try again.';
          setError(errorMessage);
          setIsLoading(false);
          initRequestedRef.current = false;
        }
      }
    };

    initPyodide();

    return () => {
      mounted = false;
    };
  }, [shouldInit]);

  const initialize = useCallback(() => {
    setShouldInit(true);
  }, []);

  const executeCode = useCallback(async (code: string): Promise<ExecutionResult> => {
    if (!pyodideRef.current || !isReady) {
      return {
        success: false,
        error: 'Python runtime not ready',
      };
    }

    const startTime = performance.now();

    try {
      // Capture stdout
      const captureCode = `
import sys
from io import StringIO

_stdout = StringIO()
_stderr = StringIO()
sys.stdout = _stdout
sys.stderr = _stderr

try:
${code.split('\n').map(line => '    ' + line).join('\n')}
except Exception as e:
    print(str(e), file=sys.stderr)
    raise

_output = _stdout.getvalue()
_error = _stderr.getvalue()
`;

      await pyodideRef.current.runPythonAsync(captureCode);
      
      const outputValue = pyodideRef.current.globals.get('_output');
      const errorValue = pyodideRef.current.globals.get('_error');
      const endTime = performance.now();

      const errorText =
        typeof errorValue === 'string'
          ? errorValue
          : errorValue != null
          ? String(errorValue)
          : '';

      if (errorText.trim().length > 0) {
        return {
          success: false,
          error: errorText.trim(),
          executionTime: endTime - startTime,
        };
      }

      const outputText =
        typeof outputValue === 'string'
          ? outputValue
          : outputValue != null
          ? String(outputValue)
          : '';

      return {
        success: true,
        output: outputText || 'Code executed successfully (no output)',
        executionTime: endTime - startTime,
      };
    } catch (err) {
      const endTime = performance.now();
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Code execution failed',
        executionTime: endTime - startTime,
      };
    }
  }, [isReady]);

  const ensureMicropipReady = useCallback(async (): Promise<boolean> => {
    if (!pyodideRef.current || !isReady) {
      return false;
    }
    if (micropipLoadedRef.current) {
      return true;
    }

    try {
      await pyodideRef.current.loadPackage('micropip');
      micropipLoadedRef.current = true;
      return true;
    } catch (err) {
      console.error('Failed to load micropip:', err);
      return false;
    }
  }, [isReady]);

  const installPackageViaMicropip = useCallback(async (packageName: string): Promise<boolean> => {
    if (!pyodideRef.current || !isReady) {
      return false;
    }

    const micropipReady = await ensureMicropipReady();
    if (!micropipReady) {
      return false;
    }

    const installScript = `
import micropip
import asyncio

async def _install():
    await micropip.install(${JSON.stringify(packageName)})

asyncio.run(_install())
`.trim();

    try {
      await pyodideRef.current.runPythonAsync(installScript);
      return true;
    } catch (err) {
      console.error(`Micropip install failed for ${packageName}:`, err);
      return false;
    }
  }, [ensureMicropipReady]);

  const loadPackage = useCallback(async (packageName: string): Promise<boolean> => {
    if (!pyodideRef.current || !isReady) {
      console.error('Python runtime not ready');
      return false;
    }

    try {
      await pyodideRef.current.loadPackage(packageName);
      return true;
    } catch (err) {
      console.warn(`Failed to load package ${packageName} via loadPackage, falling back to micropip`, err);
      return installPackageViaMicropip(packageName);
    }
  }, [installPackageViaMicropip, isReady]);

  const reset = useCallback(async (): Promise<void> => {
    if (!pyodideRef.current || !isReady) {
      return;
    }

    try {
      // Reset the Python environment
      await pyodideRef.current.runPythonAsync(`
import sys
for module in list(sys.modules.keys()):
    if not module.startswith('_') and module not in ['sys', 'builtins']:
        del sys.modules[module]
`);
    } catch (err) {
      console.error('Failed to reset Python environment:', err);
    }
  }, [isReady]);

  const loadDataFrame = useCallback(async (
    varName: string,
    data: Array<Record<string, unknown>>
  ): Promise<boolean> => {
    if (!pyodideRef.current || !isReady) {
      console.error('Python runtime not ready');
      return false;
    }

    try {
      // Ensure pandas is loaded
      const pandasReady = await loadPackage('pandas');
      if (!pandasReady) {
        console.error('Unable to ensure pandas is installed before creating the DataFrame');
        return false;
      }

      // Convert data to JSON string
      const dataJson = JSON.stringify(data);

      // Create DataFrame in Pyodide
      await pyodideRef.current.runPythonAsync(`
import pandas as pd
import json

# Load dataset
${varName}_data = json.loads(${JSON.stringify(dataJson)})
${varName} = pd.DataFrame(${varName}_data)
`);

      return true;
    } catch (err) {
      console.error(`Failed to load DataFrame ${varName}:`, err);
      return false;
    }
  }, [isReady, loadPackage]);

  return {
    isReady,
    isLoading,
    error,
    executeCode,
    loadPackage,
    loadDataFrame,
    reset,
    initialize,
  };
}
