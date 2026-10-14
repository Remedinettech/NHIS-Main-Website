export interface AsyncState<T> {
  data: T | undefined;
  error: Error | undefined;
  /** True while the first request for the current inputs is running. */
  loading: boolean;
  /** True while a refresh runs and `data` still holds the previous result. */
  refreshing: boolean;
  reload: () => void;
}
