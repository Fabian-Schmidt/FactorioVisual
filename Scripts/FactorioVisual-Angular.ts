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
                [itemName: string]: Cy.NodeDefinition[]
            } = {};

            var recipes: IInternalRecipes;
            recipes = data.recipe;

            for (var key in recipes) {
                var recipe = recipes[key];
                var node: Cy.NodeDefinition;

                if (recipe.result) {
                    //recipe has one result
                    node = {
                        classes: 'recipe recipeSingleItemResult recipeItem',
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
                    if (itemToNode[recipe.result] == undefined)
                        itemToNode[recipe.result] = [];
                    itemToNode[recipe.result].push(node);
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
                    if (recipe.results.length > 1) {
                        parentNode.classes += ' recipeMultiItemResult';
                    } else {
                        parentNode.classes += ' recipeSingleItemResult';
                    }
                    if (recipe.subgroup) {
                        parentNode.classes += ' ' + itemSubGroups[recipe.subgroup].group;
                        parentNode.data.subgroup_order = itemSubGroups[recipe.subgroup].order;
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
                        node = {
                            classes: 'recipeItem',
                            data: {
                                id: recipe.name + '_' + result.name,
                                parent: recipe.name,
                                name: recipe.name + ' -> ' + result.name,

                                result: result.name,
                                result_count: result.amount,

                                energy_required: recipe.energy_required,
                                //icon: factorio.factorioFolder + 'data/base/graphics/terrain/blank.png',
                                order: undefined,
                                selected: false
                            }
                        };
                        nodes.push(node);
                        if (itemToNode[result.name] == undefined)
                            itemToNode[result.name] = [];
                        itemToNode[result.name].push(node);
                        
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

                    var sourceProducts = itemToNode[ingredient.name];
                    if (sourceProducts == undefined) {
                        //source Product not found. It is not a ingredient. Must be a raw resource.
                        //create it
                        itemToNode[ingredient.name] = [{
                            classes: 'recipe onlyIngredient',
                            data: {
                                id: ingredient.name,
                                name: ingredient.name,
                                result: ingredient.name,
                                result_count: undefined,
                                category: undefined,
                                subgroup: undefined,
                                energy_required: undefined,
                                //icon: factorio.factorioFolder + 'data/base/graphics/terrain/blank.png',
                                order: undefined
                            }
                        }];
                        nodes.push(itemToNode[ingredient.name][0]);
                        sourceProducts = itemToNode[ingredient.name];
                    }

                    //create connection to source products. If more than one mark it.
                    for (var key in sourceProducts) {
                        var sourceProduct = sourceProducts[key];
                        edges.push({
                            classes: sourceProducts.length > 1 ? 'recipe ingredientChoice' : 'recipe',
                            data: {
                                source: sourceProduct.data.id,
                                target: recipe.name,
                                amount: ingredient.amount
                            }
                        })
                    }
                }
            }

            //Find icon for Products
            for (var key in data) {
                //if (key != 'recipe') {
                var dataGroup = data[key];
                for (var key in dataGroup) {
                    var dataElement = dataGroup[key];
                    if (dataElement.icon != undefined) {
                        var products = itemToNode[dataElement.name];
                        if (products != undefined) {
                            for (var key in products) {
                                var product = products[key];
                                if (product.data['icon'] == undefined) {
                                    product.data['icon'] = factorio.iconConfigToURI(dataElement.icon);
                                }
                                if (dataElement.subgroup != undefined && product.classes.indexOf('recipe ') >= 0) {
                                    product.data['subgroup'] = dataElement.subgroup;
                                    product.classes += " " + itemSubGroups[dataElement.subgroup].group;
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
                //}
            }

            //Find subgroup_order for Products
            for (var key in itemToNode) {
                var products = itemToNode[key];
                for (var key in products) {
                    var product = products[key];
                    if (product.classes.indexOf('recipe ') >= 0) {
                        if (product.data['subgroup_order'] == undefined && product.data['subgroup'] != undefined) {
                            product.data['subgroup_order'] = itemSubGroups[product.data['subgroup']].order;
                        }
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
        //factorioGraph.productsRelated = function (productName: string): IProduct[] {
        //    if (productName == undefined || productName.length < 3) {
        //        throw 'Invalid product name.';
        //    }

        //    var ret: IProduct[] = [];
        //    cyOfRecipe.nodes('#' + productName).incomers().nodes().forEach(function (ele) {
        //        ret.push(ele.data());
        //    });
        //    cyOfRecipe.nodes('#' + productName).outgoers().nodes().forEach(function (ele) {
        //        ret.push(ele.data());
        //    });
        //    return ret;
        //}
        factorioGraph.recipesRelatedCollection = function (recipeName: string): Cy.Collection {
            if (recipeName == undefined || recipeName.length < 3) {
                throw 'Invalid product name.';
            }

            var ret: Cy.Collection = cyOfRecipe.collection();
            ret = ret.add(cyOfRecipe.nodes('#' + recipeName));
            ret = ret.add(cyOfRecipe.nodes('#' + recipeName).incomers());
            ret = ret.add(cyOfRecipe.nodes('#' + recipeName).outgoers());
            ret = ret.add(cyOfRecipe.nodes('#' + recipeName).incomers().nodes().parents());
            ret = ret.add(cyOfRecipe.nodes('#' + recipeName).outgoers().nodes().children());
            ret = ret.add(cyOfRecipe.nodes('#' + recipeName).children());
            ret = ret.add(cyOfRecipe.nodes('#' + recipeName).children().incomers());
            ret = ret.add(cyOfRecipe.nodes('#' + recipeName).children().outgoers());
            ret = ret.add(cyOfRecipe.nodes('#' + recipeName).children().incomers().nodes().parents());
            ret = ret.add(cyOfRecipe.nodes('#' + recipeName).children().outgoers().nodes().children());

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
                $rootScope.$apply();
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
                        name: 'breadthfirst',

                        fit: true, // whether to fit the viewport to the graph
                        directed: true, // whether the tree is directed downwards (or edges can point in any direction if false)
                        padding: 100, // padding on fit
                
                        circle: false, // put depths in concentric circles if true, put depths top down if false
                        spacingFactor: 1.75, // positive spacing factor, larger => more space between nodes (N.B. n/a if causes overlap)
                        boundingBox: undefined, // constrain layout bounds; { x1, y1, x2, y2 } or { x1, y1, w, h }
                        avoidOverlap: true, // prevents node overlap, may overflow boundingBox if not enough space
                        roots: undefined, // the roots of the trees
                        maximalAdjustments: 0, // how many times to try to position the nodes in a maximal way (i.e. no backtracking)
                        animate: true, // whether to transition the node positions
                        animationDuration: 500, // duration of animation in ms if enabled
                        ready: undefined, // callback on layoutready
                        stop: undefined // callback on layoutstop
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
                                'target-arrow-color': '#000',
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
                                'background-color': '#B5844E'
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
                var productName = product.name;
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

                    that.cy.nodes('#' + productName).data('displayCount', --displayCount);
                    that.cy.nodes('#' + productName).forEach(removeOneUsageFunc);
                    that.cy.nodes('#' + productName).incomers().nodes().forEach(removeOneUsageFunc);
                    that.cy.nodes('#' + productName).outgoers().nodes().forEach(removeOneUsageFunc);

                    //TODO: this leave unused edges in the cy object.
                    that.cy.remove(that.cy.nodes('#' + productName).incomers('[^displayCount], [displayCount = 0]').nodes('[usageCount = 0]'));
                    that.cy.remove(that.cy.nodes('#' + productName).outgoers('[^displayCount], [displayCount = 0]').nodes('[usageCount = 0]'));

                    that.cy.remove(that.cy.nodes('#' + productName + '[usageCount = 0]'));
                }
                //Trigger a layout update
                (<any>that.cy).layout();
            });
        }
    }
}