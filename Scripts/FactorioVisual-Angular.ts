/// <reference path="typings/jquery/jquery.d.ts" />
/// <reference path="factoriovisual.ts" />
/// <reference path="typings/angularjs/angular.d.ts" />
'use strict';

jQuery(function () {
    var app = angular.module('app', ['angular.filter']);

    app.factory('factorioData', FactorioVisualAngular.factorioData);
    app.factory('factorioGraph', FactorioVisualAngular.factorioGraph);
    app.controller('selectController', FactorioVisualAngular.selectController);
    app.controller('graphController', FactorioVisualAngular.graphController);
});


module FactorioVisualAngular {
    export interface IFactorioData {
        (): ng.IPromise<any>;
        listeners: any;
    };
    export function factorioData($q: ng.IQService): IFactorioData {
        var factorioData: any;
        var deferred = $q.defer();
        factorio.dataLoadedPromise.then(function () {
            var data = this;
            deferred.resolve(data);
        });
        factorioData = function () {
            return deferred.promise;
        };
        return factorioData;
    }
    factorioData.$inject = ['$q'];

    export interface IFactorioGraph {
        (): ng.IPromise<any>;
        itemGroups: IItemGroup[];
        recipes(itemGroup?: string): IRecipes;
        //recipesRelated(recipeName: string): IRecipe[];
        recipesRelatedCollection(recipeName: string): Cy.Collection;
    };
    export interface IIngredient {
        amount?: number,
        name?: string,
        type?: string
    }
    //export interface IProducts {
    //    [productName: string]: IProduct
    //}
    //export interface IProduct {
    //    enabled: string,
    //    category: string,
    //    energy_required: number,
    //    name: string,
    //    result: string,
    //    result_count: number,
    //    subgroup: string,
    //    subgroup_order:string,
    //    icon: string,
    //    order?: string,
    //    type: string;
    //    selected?: boolean;
    //}
    export interface IRecipes {
        [recipeName: string]: IRecipe
    };
    export interface IRecipe {
        id: string,
        category: string,
        energy_required: number,
        //ingredients: {
        //    amount: number,
        //    name: string,
        //    type: string
        //}[],
        order: string,
        name: string,
        results_item_count: number,
        //results: {
        //    amount: number,
        //    name: string,
        //    type: string
        //}[],
        subgroup: string,
        subgroup_order: string,
        icon: string,
        type: string;
        selected: boolean;
    }
    export interface IInternalRecipes {
        [recipeName: string]: IInternalRecipe
    };
    export interface IInternalRecipe {
        enabled: string,
        category?: string,
        energy_required?: number,
        ingredients: {
            amount?: number,
            name?: string,
            type?: string,
            /**
             * 1 - name, 2 - amount
             */
            [index: number]: any
        }[],
        order: string,
        name: string,
        result?: string,
        results?: {
            amount?: number,
            name?: string,
            type?: string,
            /**
             * 1 - name, 2 - amount
             */
            [index: number]: any
        }[],
        result_count?: number,
        subgroup?: string,
        icon?: string
    }
    export interface IItemGroup {
        name: string,
        inventory_order: string,
        order: string,
        icon: string
    };
    export interface IItemSubGroup {
        [name: string]: {
            name: string,
            group: string,
            order: string
        }
    };

    export function factorioGraph($q: ng.IQService, factorioData: FactorioVisualAngular.IFactorioData): IFactorioGraph {
        var factorioGraph: any;
        var cyOfRecipe: Cy.Instance;
        var itemGroups: IItemGroup[] = [];
        var itemSubGroups: IItemSubGroup = {};
        var deferred = $q.defer();
        factorioData().then(function (data) {
            //Fill itemGroups variable
            for (var key in data['item-group']) {
                var group = data['item-group'][key];
                //TODO: Filter after read of recipes to find groups without items.
                if (group.name != 'other' && group.name != 'enemies' && group.name != 'environment') {
                    itemGroups.push({
                        name: group.name,
                        inventory_order: group.inventory_order,
                        order: group.order,
                        icon: factorio.iconConfigToURI(group.icon)
                    });
                }
            }
            //Fill itemSubGroups variable
            for (var key in data['item-subgroup']) {
                var group = data['item-subgroup'][key];
                itemSubGroups[group.name] = {
                    name: group.name,
                    group: group.group,
                    order: group.order
                };
            }

            var nodes: Cy.NodeDefinition[] = [];
            var edges: Cy.EdgeDefinition[] = [];
            
            //Lookup of items to speed up later finding icons etc.
            var itemToNode: {
                [itemName: string]: Cy.NodeDefinition
            } = {};
            var recipeToNode: {
                [itemName: string]: Cy.NodeDefinition
            } = {};

            var recipes: IInternalRecipes;
            recipes = data.recipe;

            for (var key in recipes) {
                var recipe = recipes[key];
                var node: Cy.NodeDefinition;

                if (recipe.result) {
                    //recipe has one result
                    node = {
                        classes: 'recipe item',
                        data: {
                            id: recipe.name,
                            name: recipe.name,
                            results_item_count: 1,
                            result: recipe.result,
                            result_count: recipe.result_count == undefined ? 1 : recipe.result_count,
                            category: recipe.category == undefined ? 'crafting' : recipe.category,
                            subgroup: recipe.subgroup,
                            subgroup_order: undefined,
                            energy_required: recipe.energy_required,
                            //icon: factorio.factorioFolder + 'data/base/graphics/terrain/blank.png',
                            order: undefined,
                            selected: false
                        }
                    };
                    nodes.push(node);
                    recipeToNode[recipe.name] = node;
                    if (itemToNode[recipe.result] == undefined) {
                        itemToNode[recipe.result] = node;
                    } else {
                        //Their are more than one recipe to create this item.
                        //Create a item node and link all this one.
                        node.classes = 'recipe';
                        node.data.id = (<any>node.data).name;
                        edges.push({
                            classes: 'recipe',
                            data: {
                                source: recipe.name,
                                target: 'item_' + recipe.result,
                                amount: (<any>node.data).result_count
                            }
                        });

                        if (itemToNode[recipe.result].classes != 'item') {
                            //Change old node
                            node = itemToNode[recipe.result];
                            node.classes = 'recipe';
                            edges.push({
                                classes: 'recipe',
                                data: {
                                    source: node.data.id,
                                    target: 'item_' + recipe.result,
                                    amount: (<any>node.data).result_count
                                }
                            });

                            node = {
                                classes: 'item norecipe',
                                data: {
                                    id: 'item_' + recipe.result,
                                    name: recipe.result,
                                    
                                    //icon: factorio.factorioFolder + 'data/base/graphics/terrain/blank.png',
                                    order: undefined,
                                    selected: false
                                }
                            };
                            nodes.push(node);
                            itemToNode[recipe.result] = node;
                        }
                    }
                } else if (recipe.results) {
                    //recipe has one or many results

                    //if (recipe.results.length > 1) {
                    //When more than one make a parent group
                    var icon = undefined;//factorio.factorioFolder + 'data/base/graphics/terrain/blank.png';
                    if (recipe.icon) {
                        icon = factorio.iconConfigToURI(recipe.icon);
                    }
                    var parentNode = {
                        classes: 'recipe ',
                        data: {
                            id: recipe.name,
                            name: recipe.name,
                            results_item_count: recipe.results.length,
                            category: recipe.category == undefined ? 'crafting' : recipe.category,
                            subgroup: recipe.subgroup,
                            subgroup_order: undefined,
                            energy_required: recipe.energy_required,
                            icon: icon,
                            order: undefined,
                            selected: false
                        }
                    };
                    recipeToNode[parentNode.data.id] = parentNode;
                    //if (recipe.results.length > 1) {
                    //    parentNode.classes += ' recipeMultiItemResult';
                    //} else {
                    //    parentNode.classes += ' recipeSingleItemResult';
                    //}
                    if (recipe.subgroup) {
                        if (itemSubGroups[recipe.subgroup] == undefined) {
                            if (console && console.error) console.error("Item sub group '" + recipe.subgroup + "' not found.");
                        } else {
                            parentNode.classes += ' ' + itemSubGroups[recipe.subgroup].group;
                            parentNode.data.subgroup_order = itemSubGroups[recipe.subgroup].order;
                        }
                    }
                    nodes.push(parentNode);
                    //}
                    for (var key in recipe.results) {
                        var result = recipe.results[key];
                        if (result.name == undefined) {
                            result.name = result[1];
                        }
                        if (result.amount == undefined) {
                            result.amount = result[2];
                        }

                        if (itemToNode[result.name] == undefined) {
                            node = {
                                classes: 'item norecipe',
                                data: {
                                    id: 'item_' + result.name,
                                    name: result.name,
                                    
                                    //icon: factorio.factorioFolder + 'data/base/graphics/terrain/blank.png',
                                    order: undefined,
                                    selected: false
                                }
                            };
                            nodes.push(node);
                            itemToNode[result.name] = node;
                        }

                        edges.push({
                            classes: 'recipe',
                            data: {
                                source: recipe.name,
                                target: 'item_' + result.name,
                                amount: result.amount
                            }
                        });

                    }

                }
                else {
                    debugger;
                }
            }

            //Create edges from ingredients
            for (var key in recipes) {
                var recipe = recipes[key];

                for (var key in recipe.ingredients) {
                    var ingredient = recipe.ingredients[key];

                    if (ingredient.name == undefined) {
                        ingredient.name = ingredient[1];
                    }
                    if (ingredient.amount == undefined) {
                        ingredient.amount = ingredient[2];
                    }
                    var ingredientId = ingredient.name;
                    var sourceProduct = itemToNode[ingredientId];
                    if (sourceProduct == undefined) {
                        //source Product not found. It is not a ingredient. Must be a raw resource.
                        //create it
                        itemToNode[ingredientId] = {
                            classes: 'item norecipe onlyIngredient',
                            data: {
                                id: ingredientId,
                                name: ingredient.name,
                                result: ingredient.name,
                                result_count: undefined,
                                category: undefined,
                                subgroup: undefined,
                                energy_required: undefined,
                                //icon: factorio.factorioFolder + 'data/base/graphics/terrain/blank.png',
                                order: undefined
                            }
                        };
                        nodes.push(itemToNode[ingredientId]);
                        sourceProduct = itemToNode[ingredientId];
                    }

                    //create connection to source products.
                    edges.push({
                        classes: 'recipe',
                        data: {
                            source: sourceProduct.data.id,
                            target: recipe.name,
                            amount: ingredient.amount
                        }
                    })
                }
            }

            //Find icon for Products
            for (var key in data) {
                var dataGroup = data[key];
                for (var key in dataGroup) {
                    var dataElement = dataGroup[key];
                    if (dataElement.icon != undefined) {
                        var product = itemToNode[dataElement.name];
                        if (product != undefined) {
                            if (product.data['icon'] == undefined) {
                                product.data['icon'] = factorio.iconConfigToURI(dataElement.icon);
                            }
                            if (dataElement.subgroup != undefined && product.classes.indexOf('recipe ') >= 0) {
                                product.data['subgroup'] = dataElement.subgroup;
                                if (itemSubGroups[dataElement.subgroup] == undefined) {
                                    if (console && console.error) console.error("Item sub group '" + dataElement.subgroup + "' not found.");
                                } else {
                                    product.classes += " " + itemSubGroups[dataElement.subgroup].group;
                                }
                            }
                            if (dataElement.order != undefined)
                                product.data['order'] = dataElement.order;
                            if (dataElement.category != undefined)
                                product.data['category'] = dataElement.category;
                            if (dataElement.type != undefined)
                                product.data['type'] = dataElement.type;
                        }
                        var product = recipeToNode[dataElement.name];
                        if (product != undefined) {
                            if (product.data['icon'] == undefined) {
                                product.data['icon'] = factorio.iconConfigToURI(dataElement.icon);
                            }
                            if (dataElement.subgroup != undefined && product.classes.indexOf('recipe ') >= 0) {
                                product.data['subgroup'] = dataElement.subgroup;
                                if (itemSubGroups[dataElement.subgroup] == undefined) {
                                    if (console && console.error) console.error("Item sub group '" + dataElement.subgroup + "' not found.");
                                } else {
                                    product.classes += " " + itemSubGroups[dataElement.subgroup].group;
                                }
                            }
                            if (dataElement.order != undefined)
                                product.data['order'] = dataElement.order;
                            if (dataElement.category != undefined)
                                product.data['category'] = dataElement.category;
                            if (dataElement.type != undefined)
                                product.data['type'] = dataElement.type;
                        }
                    }
                }
            }

            //Find subgroup_order for Products
            for (var key in itemToNode) {
                var product = itemToNode[key];
                if (product.classes.indexOf('recipe ') >= 0) {
                    if (product.data['subgroup_order'] == undefined && product.data['subgroup'] != undefined) {
                        product.data['subgroup_order'] = itemSubGroups[product.data['subgroup']].order;
                    }
                }
            }

            cyOfRecipe = cytoscape({
                elements: {
                    nodes: nodes,
                    edges: edges
                }, headless: true,
                ready: function () {
                    deferred.resolve(factorioGraph);
                }
            });
        });
        factorioGraph = function () {
            return deferred.promise;
        };
        factorioGraph.recipes = function (itemGroup?: string): IRecipes {
            var ret: IRecipes = {};
            var selector = '';
            if (itemGroup && itemGroup != undefined && itemGroup.length > 0) {
                selector = '.' + itemGroup;
            }
            cyOfRecipe.nodes(selector).forEach(function (ele) {
                //ret.push(ele.data());
                ret[ele.id()] = ele.data();
            });

            return ret;
        }
        factorioGraph.recipesRelatedCollection = function (recipeName: string): Cy.Collection {
            if (recipeName == undefined || recipeName.length < 3) {
                throw 'Invalid product name.';
            }

            var ret: Cy.Collection = cyOfRecipe.collection();
            ret = ret.add(cyOfRecipe.nodes('#' + recipeName));
            ret = ret.add(cyOfRecipe.nodes('#' + recipeName).incomers());
            ret = ret.add(cyOfRecipe.nodes('#' + recipeName).incomers().nodes().incomers().edges());
            ret = ret.add(cyOfRecipe.nodes('#' + recipeName).incomers().nodes('.norecipe').incomers());
            ret = ret.add(cyOfRecipe.nodes('#' + recipeName).outgoers());

            return ret;
        }
        factorioGraph.itemGroups = itemGroups;
        return factorioGraph;
    }
    factorioGraph.$inject = ['$q', 'factorioData'];

    export interface ISelectScope extends ng.IScope {
        loaded: boolean;
        debug: any;
        products: IRecipes;
        itemGroups: IItemGroup[];
        selectedItemGroup: IItemGroup;
        onItemGroupSelect: (itemGroup: IItemGroup) => void;
        onProductSelect: (product: IRecipe) => void;
    }

    export class selectController {

        public static $inject = [
            '$scope',
            '$rootScope',
            'factorioGraph'
        ];

        constructor(
            private $scope: ISelectScope,
            private $rootScope: ng.IScope,
            private factorioGraph: FactorioVisualAngular.IFactorioGraph) {

            $scope.loaded = false;
            $scope.products = {};
            $scope.itemGroups = [];
            factorioGraph().then(function (data) {
                factorioGraph = data;

                $scope.loaded = true;
                $scope.itemGroups = factorioGraph.itemGroups;
            });


            $scope.onItemGroupSelect = function (itemGroup: IItemGroup): void {
                if ($scope.selectedItemGroup === itemGroup) {
                    $scope.selectedItemGroup = undefined;
                    $scope.products = undefined;
                } else {
                    $scope.selectedItemGroup = itemGroup;
                    $scope.products = factorioGraph.recipes(itemGroup.name);
                }
            }

            $scope.onProductSelect = function (product: IRecipe): void {
                $rootScope.$emit('factorio.selectProduct', product);
            }

            $rootScope.$on('factorio.selectProduct', function (event: ng.IAngularEvent, product: IRecipe) {
                if (product.selected == undefined) {
                    product.selected = true;
                } else {
                    product.selected = !product.selected;
                }
                //$scope.$apply();
                //$rootScope.$apply();
            });
        }
    }

    export interface IGraphScope extends ng.IScope {
        loaded: boolean;
        debug: any;
    }

    export class graphController {
        public static $inject = [
            '$scope',
            '$rootScope',
            'factorioGraph'
        ];
        private cy: Cy.Instance;
        constructor(
            private $scope: IGraphScope,
            private $rootScope: ng.IScope,
            private factorioGraph: FactorioVisualAngular.IFactorioGraph) {
            var that = this;
            factorioGraph().then(function (data) {
                factorioGraph = data;
                that.cy = cytoscape({
                    container: document.getElementById('cy-Recipe'),
                    elements: {
                        nodes: [],
                        edges: []
                    },
                    layout: {
                        name: 'dagre',

                        // dagre algo options, uses default value on undefined
                        nodeSep: 110, // the separation between adjacent nodes in the same rank
                        edgeSep: undefined, // the separation between adjacent edges in the same rank
                        rankSep: undefined, // the separation between adjacent nodes in the same rank
                        rankDir: undefined, // 'TB' for top to bottom flow, 'LR' for left to right
                        minLen: function (edge) { return 1; }, // number of ranks to keep between the source and target of the edge
                        edgeWeight: function (edge) { return 1; }, // higher weight edges are generally made shorter and straighter than lower weight edges

                        // general layout options
                        fit: true, // whether to fit to viewport
                        padding: 10, // fit padding
                        animate: true, // whether to transition the node positions
                        animationDuration: 300, // duration of animation in ms if enabled
                        boundingBox: undefined, // constrain layout bounds; { x1, y1, x2, y2 } or { x1, y1, w, h }
                        ready: function () { }, // on layoutready
                        stop: function () { } // on layoutstop
                    },
                    headless: false,
                    minZoom: 0.2,
                    maxZoom: 2,
                    style: [
                        {
                            selector: 'edge',
                            css: {
                                'width': 6,
                                'curve-style': 'bezier',
                                'target-arrow-shape': 'triangle',
                                'target-arrow-fill': 'filled',
                                'target-arrow-color': '#DDD',
                                'content': 'data(amount)'
                                //'line-color': '#000'
                            }
                        },
                        {
                            selector: 'node',
                            css: {
                                'height': 50,
                                'width': 50,
                                'background-fit': 'cover',
                                'border-color': '#000',
                                'border-width': 3,
                                'border-opacity': 0.5,
                                'content': 'data(name)',
                                'shape': 'rectangle'
                                //'text-valign': 'center',
                                //'text-halign': 'center',
                            }
                        },
                        {
                            selector: 'node[icon]',
                            css: {
                                'background-image': 'data(icon)'
                            }
                        }, {
                            selector: 'node[displayCount > 0]',
                            css: {
                                'border-color': '#B5844E',
                                'background-color': '#B5844E'
                            }
                        }, {
                            selector: '.norecipe',
                            css: {
                                'shape': 'roundrectangle'
                            }
                        }, {
                            selector: '$node > node',
                            css: {
                                'padding-top': '10px',
                                'padding-left': '10px',
                                'padding-bottom': '10px',
                                'padding-right': '10px',
                                'text-valign': 'top',
                                'text-halign': 'center'
                            }
                        }],
                    ready: function () {
                        $scope.loaded = true;
                        that.cy.on('tap', (evt) => {
                            var parent = evt.cyTarget.parent();
                            if (parent.length > 0) {
                                var product = parent.data();
                                $rootScope.$emit('factorio.selectProduct', product);
                            } else {
                                var product = evt.cyTarget.data();
                                $rootScope.$emit('factorio.selectProduct', product);
                            }
                        });
                    }
                });
            });

            $rootScope.$on('factorio.selectProduct', function (event: ng.IAngularEvent, product: IRecipe) {
                var productName = product.id;
                var displayCount = that.cy.nodes('#' + productName).data('displayCount');
                if (displayCount == undefined || isNaN(displayCount)) {
                    displayCount = 0;
                }
                if (displayCount == 0) {
                    //Add this to graph
                    var productParents = factorioGraph.recipesRelatedCollection(product.id);
                    productParents.forEach((ele) => {
                        var usageCount = ele.data('usageCount');
                        if (usageCount == undefined || isNaN(usageCount)) {
                            usageCount = 0;
                        } usageCount++;
                        ele.data('usageCount', usageCount);
                    });
                    that.cy.add(productParents);
                    that.cy.nodes('#' + productName).data('displayCount', ++displayCount);
                } else {
                    //Remove this from graph
                    var removeOneUsageFunc = (ele) => {
                        var usageCount = ele.data('usageCount');
                        if (usageCount == undefined || isNaN(usageCount)) {
                            usageCount = 0;
                        } usageCount--;
                        ele.data('usageCount', usageCount);
                    };
                    var productParents = factorioGraph.recipesRelatedCollection(product.id);
                    productParents.forEach(removeOneUsageFunc);
                    that.cy.nodes('#' + productName).data('displayCount', --displayCount);
                    that.cy.remove(that.cy.nodes('[^displayCount][usageCount = 0], [displayCount = 0][usageCount = 0]'));
                    that.cy.remove(that.cy.edges('[usageCount = 0]'));
                }
                //Trigger a layout update
                (<any>that.cy).layout();
            });
        }
    }
}