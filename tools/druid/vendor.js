// /druid/ 가 쓰는 것을 한 모듈로 내보낸다. JSX 대신 htm 의 html`` 을 쓴다(빌드 없이 고칠 수 있게).
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import htm from 'htm';

export * from '@xyflow/react';
export { React, createRoot };
export const html = htm.bind(React.createElement);
