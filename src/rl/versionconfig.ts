// if stale get these from rl's Launch.log
export type VersionConfigData = {
  featureSet: string;
  buildId: string;
};

export class VersionConfiguration {
  constructor(private current: VersionConfigData) {}

  public update(newData: VersionConfigData) {
    this.current = newData;
  }

  public get() {
    return this.current;
  }
}
