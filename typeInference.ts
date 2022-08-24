import * as g from "./generated";
import { 
    gotoPreorderSucc, 
    gotoPreorderSucc_OnlyMajorTypes, 
    gotoPreorderSucc_SkipFunctionDef, 
    fileIsFunction,
    findEntryFunction
} from "./treeTraversal";
import { CustomFunction } from "./identifyCustomFunctions";

import Parser = require("tree-sitter");
import Matlab = require("tree-sitter-matlab");

let parser = new Parser() as g.Parser;
parser.setLanguage(Matlab);

// Type inference
// -----------------------------------------------------------------------------

type Type = {
      type: string;
      ndim: number;
      dim: Array<number>;
      ismatrix: boolean;
    };
    
type VarType = {
      name: string;
      type: string;
      ndim: number;
      dim: Array<number>;
      ismatrix: boolean;
    };
    

function typeInference(tree, custom_functions) {
    // First perform type inference for function definitions
    let cursor = tree.walk();
    do {
        const c = cursor as g.TypedTreeCursor;

        switch (c.nodeType) {
            case g.SyntaxType.FunctionDefinition: {
                let node = c.currentNode;
                let tree2 = parser.parse(node.bodyNode.text);
                let var_types2 = inferTypeFromAssignment(tree2, custom_functions);
                
                // Update custom_functions with info on function return type
                let obj = custom_functions.find(x => x.name === node.nameNode.text);
                if (obj != null) {
                    
                    custom_functions = custom_functions.filter(function(e) { return e.name !== obj.name });
                    
                    if (node.children[1].type == g.SyntaxType.ReturnValue) {
                        let return_node = node.children[1].firstChild;
                        
                        // If multiple return values, use pointers
                        if (return_node.type == g.SyntaxType.Matrix) {
                            let ptr_declaration = [];
                            let ptr_param = [];
                            for (let return_var of return_node.namedChildren) {
                                var [return_type, , ,] = inferType(return_var, var_types2, custom_functions);
                                ptr_declaration.push(return_type + "* p_" + return_var.text)
                                ptr_param.push("*p_" + return_var.text);
    
                            }
                            
                            const v1: CustomFunction = { 
                                name: obj.name,
                                return_type: null,
                                ptr_param: ptr_param.join(", "), 
                                ptr_declaration: ptr_declaration.join("\n"),
                                external: obj.external,
                                file: obj.file
                            };
                            custom_functions.push(v1);
    
                        // If single return value, don't use pointers 
                        } else {
                            let [type, ndim, dim, ismatrix] = inferType(return_node, var_types2, custom_functions);
                            
                            const v1: CustomFunction = { 
                                name: obj.name, 
                                return_type: {
                                    type: type,
                                    ndim: ndim,
                                    dim: dim,
                                    ismatrix: ismatrix
                                },
                                ptr_param: null, 
                                ptr_declaration: null,
                                external: obj.external,
                                file: obj.file
                            };
                            custom_functions.push(v1);
                            
                        }
                    } else {
                        const v1: CustomFunction = { 
                            name: obj.name,
                            return_type: null,
                            ptr_param: null, 
                            ptr_declaration: null,
                            external: obj.external,
                            file: obj.file
                        };
                        custom_functions.push(v1);
                        
                    }
                }
                break;
            }
        }
    } while(gotoPreorderSucc(cursor));
    
    // Then perform type inference for main tree
    let entry_fun_node = findEntryFunction(tree);
    if (entry_fun_node !== null) {
        tree = parser.parse(entry_fun_node.bodyNode.text);
    }
    let var_types = inferTypeFromAssignment(tree, custom_functions);
    
    return [var_types, custom_functions];
}

function inferTypeFromAssignment(tree, custom_functions) {
    var var_types: VarType[] = [];
    let cursor = tree.walk();
    do {
        const c = cursor as g.TypedTreeCursor;
        switch (c.nodeType) {
            case g.SyntaxType.Assignment: {
                let node = c.currentNode;
                
                // If LHS is an identifier, type is same as RHS
                if (node.leftNode.type == g.SyntaxType.Identifier || node.leftNode.type == g.SyntaxType.Attribute) {
                    const [type, ndim, dim, ismatrix] = inferType(node.rightNode, var_types, custom_functions);
                    const v1: VarType = { name: node.leftNode.text, type: type, ndim: ndim, dim: dim, ismatrix: ismatrix };
                    var_types = var_types.filter(function(e) { return e.name !== v1.name }); // replace if already in var_types
                    var_types.push(v1);
                    
        
                    
                // If LHS is subscript, type is matrix
                } else if (node.leftNode.type == g.SyntaxType.CallOrSubscript || node.leftNode.type == g.SyntaxType.CellSubscript ) {
                    const v1: VarType = { name: node.leftNode.valueNode.text, type: 'unknown', ndim: 2, dim: [1,1], ismatrix: true };
                    var_types = var_types.filter(function(e) { return e.name !== v1.name }); // replace if already in var_types
                    var_types.push(v1);
                    
                }

                break;
            }
        }
    } while(gotoPreorderSucc_SkipFunctionDef(cursor));
    return var_types;
}

function inferType(node, var_types, custom_functions) {
    switch (node.type) {
        
        // Named types
        case g.SyntaxType.Ellipsis: {
            return ['ellipsis', 2, [1, 1], false];
            break
        }
        case (g.SyntaxType.True || g.SyntaxType.False): {
            return ['bool',  2, [1, 1], false];
            break
        }
        case g.SyntaxType.Float: {
            return ['float',  2, [1, 1], false];
            break
        }
        case g.SyntaxType.Integer: {
            return ['int',  2, [1, 1], false];
            break
        }
        case g.SyntaxType.Complex: {
            return ['complex',  2, [1, 1], false];
            break
        }
        case g.SyntaxType.String: {
            return ['char',  2, [1, 1], false];
            break
        }
        case g.SyntaxType.Cell:
        case g.SyntaxType.Matrix: {
            
            let row = 0;
            let col = 0;
            let nrows = 0;
            let ncols = 0;
            
            for (let i=0; i<node.childCount; i++) {
                if (node.children[i].type === ";") {
                    row += 1;
                    col = 0;
                }
                else if (node.children[i].isNamed) {
                    
                    if (row == 0) {
                        const [type, ndim, dim] = inferType(node.children[i], var_types, custom_functions);
                        ncols += dim[1];
                    }
                    if (col == 0) {
                        const [type, ndim, dim] = inferType(node.children[i], var_types, custom_functions);
                        nrows += dim[0];
                    }
                    col += 1;
                }
            }
            
            let children_types = [];
            
            for (let child of node.namedChildren) {
                let [child_type,,,] = inferType(child, var_types, custom_functions);
                children_types.push(child_type);
            }
            
            var type = 'unknown';
            if (children_types.every(val => val === children_types[0])) {
                type = children_types[0];
                
            } else if (children_types.every(val => ['int','float','complex'].includes(val))) {
                
                if (children_types.includes('complex')) {
                    type = 'complex';
                } else if (children_types.includes('float')) {
                    type = 'float';
                } else if (children_types.includes('int')) {
                    type = 'int'; 
                }
            } else {
                type = 'heterogeneous';
            }
            
            return [type, 2, [nrows, ncols], true];
            break;
        }
    
            
        // Recursive calls to inferTypes
        case g.SyntaxType.ComparisonOperator:
        case g.SyntaxType.BooleanOperator: {
            return ['bool', 2, [1, 1], false];
            break;
        }
        case g.SyntaxType.TransposeOperator: {
            const [type, ndim, dim, ismatrix] = inferType(node.firstChild, var_types, custom_functions);
            return [type, 2, [dim[1], dim[0]], ismatrix];
            break;
        }
        case g.SyntaxType.UnaryOperator: {
            if (node.operatorNode.type == "~") {
                return ['bool', 2, [1, 1], false];
            }
            else {
                return inferType(node.firstChild, var_types, custom_functions);
            }
            
            break;
        }
        case g.SyntaxType.BinaryOperator: {
            
            let [left_type, left_ndim, left_dim, left_ismatrix] = inferType(node.leftNode, var_types, custom_functions);
            let [right_type, right_ndim, right_dim, right_ismatrix] = inferType(node.rightNode, var_types, custom_functions);
            
            switch (node.operatorNode.type) {
                case "+": 
                case "-": 
                case ".*": 
                case "./": 
                case ".\\":
                case "^":
                case ".^": {
                    var ndim = left_ndim;
                    var dim = left_dim;
                    break;
                }
                case "*": 
                case "/":
                case "\\": {
                    var ndim = left_ndim;
                    var dim = left_dim;
                    dim[1] = right_dim[1];
                    break;
                }
            }
            
            if (left_ismatrix || right_ismatrix) {
                var ismatrix = true;
            } else {
                var ismatrix = false;
            }
                
            if (left_type == right_type) {
                return [left_type, ndim, dim, ismatrix];
            } else if (left_type == 'complex' || right_type == 'complex') {
                return ['complex', ndim, dim, ismatrix];
            } else if (left_type == 'float' || right_type == 'float') {
                return ['float', ndim, dim, ismatrix];
            } else if (left_type == 'bool') {
                return [right_type, ndim, dim, ismatrix];
            } else if (right_type == 'bool') {
                return [left_type, ndim, dim, ismatrix];
            } else {
                return ['unknown', 2, [1, 1], false];
            }
            break;
        }
        
        // Identifiers
        case g.SyntaxType.Attribute:
        case g.SyntaxType.Identifier: {
            let obj = var_types.find(x => x.name === node.text);
            if (obj != null) {
                return [obj.type, obj.ndim, obj.dim, obj.ismatrix];
            } else {
                return ['unknown', 2, [1, 1], false];
            }
            break;
        }
        // TO DO: FIX THIS
        case g.SyntaxType.CellSubscript: {
            let dim = [];
            for (let i=1; i<node.namedChildCount; i++) {
                var [child_type,,child_dim,] = inferType(node.namedChildren[i], var_types, custom_functions);
                dim.push(child_dim[1]);
            }
            
            if (dim.length==1 && dim[0] == 1) {
                dim = [1,1];
            }
            
            if (dim.every(val => val === 1)) {
                return [child_type, 2, dim, false];
            } else {
                return [child_type, 2, dim, true];
            }
            break;
        }
        
        case g.SyntaxType.CallOrSubscript: {
   
            let [parent_type,,,parent_ismatrix] = inferType(node.valueNode, var_types, custom_functions);

            // Is a subscript
            if (parent_ismatrix) {
                
                let dim = [];
                for (let i=1; i<node.namedChildCount; i++) {
                    let [,,child_dim,] = inferType(node.namedChildren[i], var_types, custom_functions);
                    dim.push(child_dim[1]);
                }
                
                if (dim.length==1 && dim[0] == 1) {
                    dim = [1,1];
                }
                
                if (dim.every(val => val === 1)) {
                    return [parent_type, 2, dim, false];
                } else {
                    return [parent_type, 2, dim, true];
                }
                
            // Is a function call    
            } else {
                let obj = custom_functions.find(x => x.name === node.valueNode.text);
                if (obj != null) {
                    if (obj.return_type == null) {
                        return ['unknown', 2, [1,1], false];
                    } else {
                        return [obj.return_type.type, obj.return_type.ndim, obj.return_type.dim, obj.return_type.ismatrix];
                    }
                } else {
                    return ['unknown', 2, [1,1], false];
                }
            }
            break;
        }
        
        case g.SyntaxType.Slice: {

            let children_types = [];
            let children_vals = []
            
            for (let i=0; i<node.namedChildCount; i++) {
                let child = node.namedChildren[i];
                let [child_type,,,] = inferType(child, var_types, custom_functions);
                
                if (child_type == "keyword") {
                    
                    [,ndim,dim,] = inferType(node.parent.valueNode, var_types, custom_functions);
                    let firstNode = node.parent.namedChildren[1];
                    let current_dim = 0;
                    let dummyNode = node;
                    while (JSON.stringify(dummyNode) != JSON.stringify(firstNode)) {
                        dummyNode = dummyNode.previousNamedSibling;
                        current_dim += 1;
                    }
                    
                    children_vals.push(dim[current_dim]);
                    children_types.push('int');
                } else {
                    children_vals.push(Number(child.text));
                    children_types.push(child_type);
                }
                
            }
            
            
            var type = 'unknown';
            if (children_types.every(val => ['int','float','complex'].includes(val))) {
                
                if (children_types.includes('complex')) {
                    type = 'complex';
                } else if (children_types.includes('float')) {
                    type = 'float';
                } else if (children_types.includes('int')) {
                    type = 'int'; 
                }
            }
            
            
            let start = children_vals[0];
            var stop = children_vals[1];
            var step = 1;
                
            if (children_vals.length == 3) {
                stop = children_vals[2];
                step = children_vals[1];
            }
            
            let len = Math.floor((stop-start)/step) + 1;
            return [type, 2, [1, len], true];
        }
        
        case g.SyntaxType.Keyword: {
            return ['keyword', 2, [1, 1], false]
        }
        
        // Default
        default: return ['unknown', 2, [1, 1], false];
    }
}

export {Type, VarType, typeInference, inferType};