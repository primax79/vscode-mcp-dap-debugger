import { addBreakpointTool, addBreakpointsTool, removeBreakpointTool, clearBreakpointsTool, listBreakpointsTool } from './breakpoints'
import { continueTool, stepOverTool, stepIntoTool, stepOutTool, pauseTool, stopDebugTool } from './execution-control'
import {
    getActiveStackItemTool,
    getCallStackTool,
    getVariablesScopeTool,
    getThreadListTool,
    evaluateExpressionTool,
    inspectVariableTool,
} from './inspection'
import {
    listDebugSessionsTool,
    getActiveSessionTool,
    getDebugStateTool,
    startDebugTool,
    listDebugConfigsTool,
    selectDebugConfigTool,
} from './sessions'
import { getDapLogTool, getDebugConsoleTool, getExceptionInfoTool } from './dap-log'
import { getWorkspaceInfoTool, listVSCodeInstancesTool, selectVSCodeInstanceTool } from './workspace'

export const allTools = [
    addBreakpointTool,
    addBreakpointsTool,
    removeBreakpointTool,
    clearBreakpointsTool,
    listBreakpointsTool,

    listDebugSessionsTool,
    getActiveSessionTool,
    getDebugStateTool,
    startDebugTool,
    stopDebugTool,
    listDebugConfigsTool,
    selectDebugConfigTool,

    continueTool,
    stepOverTool,
    stepIntoTool,
    stepOutTool,
    pauseTool,

    getActiveStackItemTool,
    getCallStackTool,
    getVariablesScopeTool,
    getThreadListTool,
    evaluateExpressionTool,
    inspectVariableTool,

    getDapLogTool,
    getDebugConsoleTool,
    getExceptionInfoTool,

    getWorkspaceInfoTool,
    listVSCodeInstancesTool,
    selectVSCodeInstanceTool,
]

export { inputSchemas } from './schemas'
