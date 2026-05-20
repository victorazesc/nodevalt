export type DependencyMap = Record<string, string>;
export type BinMap = Record<string, string>;

export interface ParsedNpmRootPackage {
  name: string | null;
  version: string | null;
  dependencies: DependencyMap;
  devDependencies: DependencyMap;
  optionalDependencies: DependencyMap;
  peerDependencies: DependencyMap;
}

export interface ParsedNpmPackage {
  packagePath: string;
  name: string;
  version: string;
  resolved: string | null;
  integrity: string | null;
  dependencies: DependencyMap;
  devDependencies: DependencyMap;
  optionalDependencies: DependencyMap;
  peerDependencies: DependencyMap;
  bin: BinMap;
  dev: boolean;
  optional: boolean;
}

export interface ParsedNpmLockfile {
  lockfileVersion: 2 | 3;
  name: string | null;
  version: string | null;
  root: ParsedNpmRootPackage;
  packages: ParsedNpmPackage[];
}
