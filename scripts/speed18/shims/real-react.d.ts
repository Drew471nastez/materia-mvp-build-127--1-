/** Type contract for the real-React alias supplied by the speed harness bundler. */
declare module "__REAL_REACT__" {
  export {
    Children, Component, PureComponent, Fragment, Profiler, StrictMode, Suspense,
    act, cache, cloneElement, createContext, createElement, createRef, forwardRef,
    isValidElement, lazy, memo, startTransition, use, useActionState, useCallback,
    useContext, useDebugValue, useDeferredValue, useEffect, useId, useImperativeHandle,
    useInsertionEffect, useLayoutEffect, useMemo, useOptimistic, useReducer, useRef,
    useState, useSyncExternalStore, useTransition, version,
  } from "react"
  import React from "react"
  export default React
}
