require('source-map-support').install()

import Parser = require("tree-sitter");
import Matlab = require("tree-sitter-matlab");


import { readFileSync, promises as fsPromises } from 'fs';

import * as g from "./generated";

let parser = new Parser() as g.Parser;
parser.setLanguage(Matlab);


const args = process.argv.slice(2);

if (args.length != 1) {
  process.exit(1);
}

// Load the file passed as an argument
const sourceCode = readFileSync(args[0], "utf8");

let tree = parser.parse(sourceCode);

var generated_code = [];
var main_function = [];

      
var cursor_adjust = false;
var current_code = "main";

var tmpVarCnt = 0;
function generateTmpVar() {
    tmpVarCnt += 1;
    return "tmp" + tmpVarCnt;
}

// Main
function generateCode() {
    let cursor = tree.walk();
    do {
        if (cursor_adjust) {
            cursor.gotoParent();
        }
        const c = cursor as g.TypedTreeCursor;
        let node = c.currentNode;
        
        switch (node.type) {
            
            case g.SyntaxType.ExpressionStatement: {
                
                let expression = transformNode(node.firstChild);
                if (expression != "") {
                    main_function.push(expression + ";");
                }
                
                cursor_adjust = false;
                current_code = "main";
                break;
            }
        
            case g.SyntaxType.FunctionDefinition: {
                printFunctionDefDeclare(node);
                if (!cursor.gotoNextSibling()) {
                    return;
                }
                cursor_adjust = true;
                current_code = "subprogram";
                break;
            }
            

            case g.SyntaxType.IfStatement: {
                main_function.push("if (" + transformNode(node.conditionNode) + ")");
                for (let i=2; i<node.childCount; i++) {
                    if (node.children[i].isNamed) {
                        main_function.push(transformNode(node.children[i]));
                    }
                }
                if (!cursor.gotoNextSibling()) {
                    return;
                }
                cursor_adjust = true;
                current_code = "main";
                break;
            } 
            
            case g.SyntaxType.WhileStatement: {
                main_function.push("while (" + transformNode(node.conditionNode) + ")");
                for (let i=2; i<node.childCount; i++) {
                    if (node.children[i].isNamed) {
                        main_function.push(transformNode(node.children[i]));
                    }
                }
                if (!cursor.gotoNextSibling()) {
                    return;
                }
                cursor_adjust = true;
                current_code = "main";
                break;
            } 
            
            // Comments
            // TO DO: multiline comments
            case g.SyntaxType.Comment: {
                main_function.push(node.text.replace("%","//"));
                cursor_adjust = false;
                current_code = "main";
                break;
            }
            
            case g.SyntaxType.ForStatement: {
                let expression = [];
                
                if (node.rightNode.type == g.SyntaxType.Slice) {
                    main_function.push("int " + node.leftNode.text + ";");
                    expression.push("for (" + node.leftNode.text + " = ");
                    expression.push(node.rightNode.children[0].text + ";");
                    
                    if (node.rightNode.childCount == 5) {
                        expression.push(node.leftNode.text + " <= " + node.rightNode.children[4].text + ";");
                        expression.push(node.leftNode.text + " += " + node.rightNode.children[2].text);
                    } else {
                        expression.push(node.leftNode.text + " <= " + node.rightNode.children[2].text + ";");
                        expression.push("++ " + node.leftNode.text);
                    }
                    main_function.push(expression.join(" ") + ")");
                    
                } else if (node.rightNode.type == g.SyntaxType.Matrix) {
                    var tmp_var = generateTmpVar();
                    var [type, ndim, dim, ] = inferType(node.rightNode);
                    let obj = type_to_matrix_type.find(x => x.type === type);
                    if (obj != null) {
                        initializeMatrix(node.rightNode, node.leftNode.text, ndim, dim, obj.matrix_type);
                    }
                    
                
                    main_function.push("int j;");
                    expression.push("for (j = 1;");
                    expression.push("j <= " + node.rightNode.namedChildCount + ";");
                    expression.push("++j");
                    main_function.push(expression.join(" ") + ")");
                    main_function.push("indexM(" + tmp_var + ", &" + node.leftNode.text + ", " + tmp_var + "->ndim=1, j);");
                    
                }
               
                main_function.push(transformNode(node.bodyNode));
                if (!cursor.gotoNextSibling()) {
                    return;
                }
                cursor_adjust = true;
                current_code = "main";
                break;
            }

        }
    } while(gotoPreorderSucc(cursor));
}

type typeToMatrixType = {
  type: string;
  matrix_type: number;
};

const type_to_matrix_type: typeToMatrixType[] = [
        {type: "integer", matrix_type: 0},
        {type: "float", matrix_type: 1},
        {type: "complex", matrix_type: 2},
        {type: "char", matrix_type: 3}
    ];


// Main
function transformNode(node) {
    switch (node.type) {
        
        case g.SyntaxType.ExpressionStatement: {
            return transformNode(node.firstChild) + ";";
            break;
        }
        
        // Assignment
        case g.SyntaxType.Assignment: {
            if (node.rightNode.type == g.SyntaxType.Matrix || node.rightNode.type == g.SyntaxType.Cell) {

                var [type, ndim, dim, ] = inferType(node.rightNode);
                if (type == 'heterogeneous') {
                    // FILL IN
                } else {
                    let obj = type_to_matrix_type.find(x => x.type === type);
                    if (obj != null) {
                        initializeMatrix(node.rightNode, node.leftNode.text, ndim, dim, obj.matrix_type);
                    }
                    return "";
                }
            } else {
                let expression = [];
                expression.push(transformNode(node.leftNode));
                expression.push("=");
                expression.push(transformNode(node.rightNode));
                return expression.join(" ");
            }
            break;
        }
        
        // Transform matrix operations
        case g.SyntaxType.BinaryOperator:
        case g.SyntaxType.BooleanOperator:
        case g.SyntaxType.ComparisonOperator:
        case g.SyntaxType.TransposeOperator:
        case g.SyntaxType.UnaryOperator: {
            return printMatrixFunctions(node);
            break;
        }
        
        case g.SyntaxType.Block: {
            let expression = [];
            for (let child of node.namedChildren) {
                expression.push(transformNode(child));
            }
            return "{\n" + expression.join("\n") + "\n}";
            break;
        }
        
        case g.SyntaxType.CallOrSubscript: {
            // Is a custom function call
            let obj = custom_functions.find(x => x.name === node.valueNode.text);
            if (obj != null) {
                let arg_list = [];
                for (let i=2; i<node.childCount; i++) {
                    if (node.children[i].isNamed) {
                        arg_list.push(transformNode(node.children[i]));
                    }
                }
                arg_list.push(obj.ptr_param);
                let expression = [];
                expression.push(obj.ptr_declaration);
                expression.push(obj.name + "(" + arg_list.join(", ") + ")");
                return expression.join("\n"); 
            
            // Is a builtin function call
            } else if (builtin_functions.includes(node.valueNode.text)) {
                switch (node.valueNode.text) {
                    case "zeros":
                    case "ones": 
                    case "rand":
                    case "randn": {
                        let args = [];
                        for (let i=2; i<node.childCount; i++) {
                            if (node.children[i].isNamed) {
                                args.push(transformNode(node.children[i]));
                            }
                        }
                        let dim = "{" + args.join(", ") + "}";
                        let ndim = args.length;
                        var tmp_var = generateTmpVar();
                        if (current_code == "main") {
                            main_function.push(`Matrix * ${tmp_var} = ${node.valueNode.text}M(${ndim}, ${dim});`)
                        } else if (current_code == "subprogram") { 
                            function_definitions.push(`Matrix * ${tmp_var} = onesM(${ndim}, ${dim});`)
                        }
                        return tmp_var;
                        break;
                    }
                }
                
            // Is a subscript
            } else {
                const v1: VarType = { name: node.valueNode.text, type: 'unknown', ndim: 1, dim: [1], ismatrix: true };
                var_types.push(v1);
                
                let index = [];
                for (let i=2; i<node.childCount; i++) {
                    if (node.children[i].isNamed) {
                        index.push(transformNode(node.children[i]));
                    }
                }
                
                var tmp_var = generateTmpVar();
                if (current_code == "main") {
                    main_function.push("double " + tmp_var + ";");
                    main_function.push("indexM(" + node.valueNode.text + ", &" + tmp_var + ", " + index.join(", ") + ");");    
                } else if (current_code == "subprogram") {
                    function_definitions.push("double " + tmp_var + ";");
                    function_definitions.push("indexM(" + node.valueNode.text + ", &" + tmp_var + ", " + index.join(", ") + ");");    
                }
                
                return tmp_var;
            }
                    
                break;
            }
        
        case g.SyntaxType.ElseifClause: {
            let expression = [];
            expression.push("else if (" + transformNode(node.conditionNode) + ")");
            expression.push(transformNode(node.consequenceNode));
            return expression.join("\n");
            break;
        } 
        case g.SyntaxType.ElseClause: {
            let expression = [];
            expression.push("else");
            expression.push(transformNode(node.bodyNode));
            return expression.join("\n");
            break;
        }
        
        
        // Basic types
        //case g.SyntaxType.Ellipsis:
        case g.SyntaxType.String:
        case g.SyntaxType.Identifier:
        case g.SyntaxType.Integer:
        case g.SyntaxType.Float:
        case g.SyntaxType.True: 
        case g.SyntaxType.False: {
            return node.text;
            break;
        }
        
        case g.SyntaxType.Complex: {
            
            return node.firstChild.text + "*I";
        }
    }
}

// Initialize variables
// -----------------------------------------------------------------------------
var var_initializations = [];
function initializeVariables() {
    for (let var_type of var_types) {
        if (var_type.type != 'matrix' && var_type.type != 'cell') {
            var_initializations.push(var_type.type + " " + var_type.name + ";");
        }
    }
}


// Initialize matrices
// -----------------------------------------------------------------------------

var matrix_initializations = [];
function initializeMatrix(node, name, ndim, dim, matrix_type) {
        matrix_initializations.push("int ndim = " + ndim + ";");
        matrix_initializations.push("int dim = {" + dim + "};");
        matrix_initializations.push(`Matrix * ${name} = createM(ndim, dim, ${matrix_type});`)
        matrix_initializations.push("double complex *input = NULL;");
        
        let numel = dim.reduce(function(a, b) {return a * b;});
    	matrix_initializations.push("input = malloc(" + numel + "*sizeof(*input));");
    	
    	var j = 0;
    	for (let i=0; i<node.childCount; i++) {
            if (node.children[i].isNamed) {
                matrix_initializations.push("input[" + j + "] = " + node.children[i].text + ";");
                j++;
            }
    	}
    	
    	matrix_initializations.push("writeM(" + name + ", " + numel + ", input);")
    	matrix_initializations.push("free(input);")
    }
    
type operatorMapping = {
  operator: string;
  function: string;
};


const binaryMapping: operatorMapping[] = [
        {operator: '+', function: "addM"},
        {operator: '-', function: "minusM"},
        {operator: '*', function: "mtimesM"},
        {operator: '/', function: "mrdivideM"},
        {operator: '\\', function: "mldivideM"},
        {operator: '^', function: "mpowerM"},
        {operator: '.*', function: "timesM"},
        {operator: './', function: "rdivideM"},
        {operator: '.\\', function: "ldivideM"},
        {operator: '.^', function: "powerM"},
        {operator: '<', function: "ltM"},
        {operator: '<=', function: "leM"},
        {operator: '==', function: "eqM"},
        {operator: '>', function: "gtM"},
        {operator: '>=', function: "geM"},
        {operator: '~=', function: "neqM"},
    ];    
const unaryMapping: operatorMapping[] = [
        {operator: "+", function: "FILLIN"},
        {operator: "-", function: "FILLIN"},
        {operator: "~", function: "notM"}
    ];

const transposeMapping: operatorMapping[] = [
        {operator: "'", function: "ctransposeM"},
        {operator: ".'", function: "tranposeM"}
    ];
// Print matrix functions
// -----------------------------------------------------------------------------
function printMatrixFunctions(node) {
    var tmp_var = generateTmpVar();
    
    switch (node.type) {
        case g.SyntaxType.UnaryOperator: {
            let obj = unaryMapping.find(x => x.operator === node.operatorNode.type);
            let [type, , , ismatrix] = inferType(node.argumentNode);
            
            if (ismatrix) {
                if (current_code == "main") {
                    main_function.push(`Matrix * ${tmp_var} = ${obj.function}(${node.argumentNode.text})`);
                } else if (current_code == "subprogram") {
                    function_definitions.push(`Matrix * ${tmp_var} = ${obj.function}(${node.argumentNode.text})`);
                }
                return tmp_var;
            } else {
                return `${obj.operator}${transformNode(node.argumentNode)}`;
            }
            
            break;
                    
        }
        case g.SyntaxType.TransposeOperator: {
            let obj = transposeMapping.find(x => x.operator === node.operatorNode.type);
            let [type, , , ismatrix] = inferType(node.argumentNode);
            
            if (ismatrix) {
                if (current_code == "main") {
                    main_function.push(`Matrix * ${tmp_var} = ${obj.function}(${node.argumentNode.text})`);
                } else if (current_code == "subprogram") {
                    function_definitions.push(`Matrix * ${tmp_var} = ${obj.function}(${node.argumentNode.text})`);
                }
                return tmp_var;
            } else {
                return `${transformNode(node.argumentNode)}${obj.operator}`;
            }
            break;
        }
        case g.SyntaxType.ComparisonOperator:
        case g.SyntaxType.BooleanOperator:
        case g.SyntaxType.BinaryOperator: {
            let obj = binaryMapping.find(x => x.operator === node.operatorNode.type);
            let [left_type, , , left_ismatrix] = inferType(node.leftNode);
            let [right_type, , , right_ismatrix] = inferType(node.rightNode);
            
            if (left_ismatrix || right_ismatrix) {
                if (current_code == "main") {
                    main_function.push(`Matrix * ${tmp_var} = ${obj.function}(${node.leftNode.text},${node.rightNode.text})`);
                } else if (current_code == "subprogram") {
                    function_definitions.push(`Matrix * ${tmp_var} = ${obj.function}(${node.leftNode.text},${node.rightNode.text})`);
                }
                return tmp_var;
            } else {
                return `${transformNode(node.leftNode)} ${obj.operator} ${transformNode(node.rightNode)}`;
            }
            
            break;
        }
    }
}

// Identify function definitions
// -----------------------------------------------------------------------------
type CustomFunction = {
  name: string;
  ptr_param: string;
  ptr_declaration:string;
};

var custom_functions: CustomFunction[] = [];

var builtin_functions = ['zeros', 'ones'];

function identifyCustomFunctions() {
    let cursor = tree.walk();
    do {
        const c = cursor as g.TypedTreeCursor;
        switch (c.nodeType) {
            case g.SyntaxType.FunctionDefinition: {
                let node = c.currentNode;
                if (node.isNamed && node.nameNode != null) {
                    
                    if (node.children[1].type == g.SyntaxType.ReturnValue) {
                        let return_node = node.children[1].firstChild;
                        
                        // If multiple return values, use pointers
                        if (return_node.type == g.SyntaxType.Matrix) {
                            let ptr_declaration = [];
                            let ptr_param = [];
                            for (let return_var of return_node.namedChildren) {
                                var [return_type, , ,] = inferType(return_var);
                                ptr_declaration.push(return_type + "* p_" + return_var.text)
                                ptr_param.push("*p_" + return_var.text);

                            }
                            
                            const v1: CustomFunction = { name: node.nameNode.text, ptr_param:ptr_param.join(", "), ptr_declaration:ptr_declaration.join("\n") };
                            custom_functions.push(v1);
  
                        // If single return value, don't use pointers 
                        } else {
                            const v1: CustomFunction = { name: node.nameNode.text, ptr_param:"", ptr_declaration:""};
                            custom_functions.push(v1);
                            
                        }
                    } else {
                        const v1: CustomFunction = { name: node.nameNode.text, ptr_param:"", ptr_declaration:""};
                        custom_functions.push(v1);
                        
                    }
 
                }
                break;
            }
        }
    } while(gotoPreorderSucc(cursor));
}

// Print function definitions and declarations
// -----------------------------------------------------------------------------
var function_definitions = [];
var function_declarations = [];

function printFunctionDefDeclare(node) {
    if (node.isNamed && node.nameNode != null) {
        
        var param_list = [];
        for (let param of node.parametersNode.namedChildren) {
            let [param_type, , ,] = inferType(param);
            param_list.push(param_type + " " + param.text);
        }
        
        if (node.children[1].type == g.SyntaxType.ReturnValue) {
            let return_node = node.children[1].firstChild;
            
            // If multiple return values, use pointers
            if (return_node.type == g.SyntaxType.Matrix) {
                let ptr_declaration = [];
                for (let return_var of return_node.namedChildren) {
                    ptr_declaration.push("*p_" + return_var.text + " = " + return_var.text + ";");
                    var [return_type, , ,] = inferType(return_var);
                    param_list.push(return_type + "* p_" + return_var.text)
                }
                var ptr_declaration_joined = ptr_declaration.join("\n");
                
                if (param_list.length == 0) {
                    var param_list_joined = "(void)";
                } else {
                    var param_list_joined = "(" + param_list.join(", ") + ")";
                }
                
                function_declarations.push("void " + node.nameNode.text + param_list_joined + ";");
                function_definitions.push("void " + node.nameNode.text + param_list_joined);
                function_definitions.push("{");
                function_definitions.push(ptr_declaration_joined);
                
            // If single return value, don't use pointers 
            } else {
                if (param_list.length == 0) {
                    var param_list_joined = "(void)";
                } else {
                    var param_list_joined = "(" + param_list.join(", ") + ")";
                }
                
                var [return_type, , ,] = inferType(return_node);
                if (return_type == "char") {
                    return_type = "char *";
                }
                
                function_declarations.push(return_type + " " + node.nameNode.text + param_list_joined + ";");
                function_definitions.push(return_type + " " + node.nameNode.text + param_list_joined);
                function_definitions.push("{");
            }
        }
        
        for (let child of node.bodyNode.children) {
            function_definitions.push(transformNode(child));
        }
        
        function_definitions.push("}");
    }
    
}



// Type inference
// -----------------------------------------------------------------------------
type VarType = {
  name: string;
  type: string;
  ndim: number;
  dim: Array<number>;
  ismatrix: boolean;
};

var var_types: VarType[] = [];
    
function inferType(node) {
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
                        const [type, ndim, dim] = inferType(node.children[i]);
                        ncols += dim[1];
                    }
                    if (col == 0) {
                        const [type, ndim, dim] = inferType(node.children[i]);
                        nrows += dim[0];
                    }
                    col += 1;
                }
            }
            
            let children_types = [];
            
            for (let child of node.namedChildren) {
                //children_types.push(child.type);
                let [child_type,,,] = inferType(child);
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
            const [type, ndim, dim, ismatrix] = inferType(node.firstChild);
            return [type, 2, [dim[1], dim[0]], ismatrix];
            break;
        }
        case g.SyntaxType.UnaryOperator: {
            if (node.operatorNode.type == "~") {
                return ['bool', 2, [1, 1], false];
            }
            else {
                return inferType(node.firstChild);
            }
            
            break;
        }
        case g.SyntaxType.BinaryOperator: {
            
            let [left_type, left_ndim, left_dim, left_ismatrix] = inferType(node.leftNode);
            let [right_type, right_ndim, right_dim, right_ismatrix] = inferType(node.rightNode);
            
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
        case g.SyntaxType.Identifier: {
            let obj = var_types.find(x => x.name === node.text);
            if (obj != null) {
                return [obj.type, obj.ndim, obj.dim];
            } else {
                return ['unknown', 2, [1, 1], false];
            }
            break;
        }
        
        // Default
        default: return ['unknown', 2, [1, 1], false];
    }
}

function typeInference() {
    let cursor = tree.walk();
    do {
        const c = cursor as g.TypedTreeCursor;

        switch (c.nodeType) {
            case g.SyntaxType.Assignment: {
                let node = c.currentNode;

                // If LHS is an identifier, type is same as RHS
                if (node.leftNode.type == g.SyntaxType.Identifier) {
                    const [type, ndim, dim, ismatrix] = inferType(node.rightNode);
                    const v1: VarType = { name: node.leftNode.text, type: type, ndim: ndim, dim: dim, ismatrix: ismatrix };
                    var_types.push(v1);
                    
                    
                // If LHS is subscript, type is matrix
                } else if (node.leftNode.type == g.SyntaxType.CallOrSubscript) {
                    const v1: VarType = { name: node.leftNode.text, type: 'unknown', ndim: 2, dim: [1,1], ismatrix: true };
                    var_types.push(v1);
                }
                
                
                break;
            }
        }
    } while(gotoPreorderSucc(cursor));
    console.log("Inferred types:");
    console.log(var_types);
}

// Tree traversal function
// -----------------------------------------------------------------------------

function gotoPreorderSucc(cursor: g.TreeCursor): boolean {
    if (cursor.gotoFirstChild())
        return true;
    while (!cursor.gotoNextSibling()) {
        if (!cursor.gotoParent()) {
            return false;
        }
    }
    return true;
}

// Call functions
// -----------------------------------------------------------------------------

console.log("Source code:\n" + sourceCode);
console.log("---------------------\n");

identifyCustomFunctions();
typeInference();
initializeVariables();
generateCode();

console.log("---------------------\nGenerated code:\n");
generated_code.push(
`//Link
#include <stdio.h>
#include <stdbool.h>
#include <complex.h>`)
generated_code.push("\n//Function declarations")
generated_code.push(function_declarations.join("\n"));
generated_code.push(
`\n//Main function
int main(void)
{
// Initialize variables`);
generated_code.push(var_initializations.join("\n"));
generated_code.push("\n//Initialize matrices")
generated_code.push(matrix_initializations.join("\n"));
generated_code.push("\n" + main_function.join("\n"));
generated_code.push("}\n\n//Subprograms");
generated_code.push(function_definitions.join("\n"));
console.log(generated_code.join("\n"));