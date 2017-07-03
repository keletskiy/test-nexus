//
//
//

function detectmob() { 
    "use strict";
    /* global navigator */
    if( navigator.userAgent.match(/Android/i) ||
     navigator.userAgent.match(/webOS/i) ||
     navigator.userAgent.match(/iPhone/i) ||
     navigator.userAgent.match(/iPad/i) ||
     navigator.userAgent.match(/iPod/i) ||
     navigator.userAgent.match(/BlackBerry/i) ||
     navigator.userAgent.match(/Windows Phone/i)
    ){
        return true;
    }
    else {
        return false;
    }
}

var available_lods = [0.1, 0.2, 0.3, 0.5];

var DEBUG = {
    bUseMaxLod : false,
    bUseWireframe : false,
    bIsMobile : detectmob()
};

/**
 * @author mrdoob / http://mrdoob.com/
 * 
 * -parse modified
 */

THREE.OBJWorkerLoader = function ( manager ) {

    "use strict";

    var _self = this;
    /* jshint ignore:start */
    if (!_self)
        _self = eval('self');
    /* jshint ignore:end */

    _self.materials = null;

    _self.regexp = {
        // v float float float
        vertex_pattern           : /^v\s+([\d|\.|\+|\-|e|E]+)\s+([\d|\.|\+|\-|e|E]+)\s+([\d|\.|\+|\-|e|E]+)/,
        // vn float float float
        normal_pattern           : /^vn\s+([\d|\.|\+|\-|e|E]+)\s+([\d|\.|\+|\-|e|E]+)\s+([\d|\.|\+|\-|e|E]+)/,
        // vt float float
        uv_pattern               : /^vt\s+([\d|\.|\+|\-|e|E]+)\s+([\d|\.|\+|\-|e|E]+)/,
        // f vertex vertex vertex
        face_vertex              : /^f\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)(?:\s+(-?\d+))?/,
        // f vertex/uv vertex/uv vertex/uv
        face_vertex_uv           : /^f\s+(-?\d+)\/(-?\d+)\s+(-?\d+)\/(-?\d+)\s+(-?\d+)\/(-?\d+)(?:\s+(-?\d+)\/(-?\d+))?/,
        // f vertex/uv/normal vertex/uv/normal vertex/uv/normal
        face_vertex_uv_normal    : /^f\s+(-?\d+)\/(-?\d+)\/(-?\d+)\s+(-?\d+)\/(-?\d+)\/(-?\d+)\s+(-?\d+)\/(-?\d+)\/(-?\d+)(?:\s+(-?\d+)\/(-?\d+)\/(-?\d+))?/,
        // f vertex//normal vertex//normal vertex//normal
        face_vertex_normal       : /^f\s+(-?\d+)\/\/(-?\d+)\s+(-?\d+)\/\/(-?\d+)\s+(-?\d+)\/\/(-?\d+)(?:\s+(-?\d+)\/\/(-?\d+))?/,
        // o object_name | g group_name
        object_pattern           : /^[og]\s*(.+)?/,
        // s boolean
        smoothing_pattern        : /^s\s+(\d+|on|off)/,
        // mtllib file_reference
        material_library_pattern : /^mtllib /,
        // usemtl material_name
        material_use_pattern     : /^usemtl /
    };

    _self.setPath = function ( value ) {

        _self.path = value;
    };

    _self.setMaterials = function ( materials ) {

        _self.materials = materials;
    };

    _self._createParserState = function () {

        var state = {
            objects  : [],
            object   : {},

            vertices : [],
            normals  : [],
            uvs      : [],

            materialLibraries : [],

            startObject: function ( name, fromDeclaration ) {

                // If the current object (initial from reset) is not from a g/o declaration in the parsed
                // file. We need to use it for the first parsed g/o to keep things in sync.
                if ( this.object && this.object.fromDeclaration === false ) {

                    this.object.name = name;
                    this.object.fromDeclaration = ( fromDeclaration !== false );
                    return;

                }

                var previousMaterial = ( this.object && typeof this.object.currentMaterial === 'function' ? this.object.currentMaterial() : undefined );

                if ( this.object && typeof this.object._finalize === 'function' ) {

                    this.object._finalize( true );

                }

                this.object = {
                    name : name || '',
                    fromDeclaration : ( fromDeclaration !== false ),

                    geometry : {
                        vertices : [],
                        normals  : [],
                        uvs      : []
                    },
                    materials : [],
                    smooth : true,

                    startMaterial : function( name, libraries ) {

                        var previous = this._finalize( false );

                        // New usemtl declaration overwrites an inherited material, except if faces were declared
                        // after the material, then it must be preserved for proper MultiMaterial continuation.
                        if ( previous && ( previous.inherited || previous.groupCount <= 0 ) ) {

                            this.materials.splice( previous.index, 1 );

                        }

                        var material = {
                            index      : this.materials.length,
                            name       : name || '',
                            mtllib     : ( Array.isArray( libraries ) && libraries.length > 0 ? libraries[ libraries.length - 1 ] : '' ),
                            smooth     : ( previous !== undefined ? previous.smooth : this.smooth ),
                            groupStart : ( previous !== undefined ? previous.groupEnd : 0 ),
                            groupEnd   : -1,
                            groupCount : -1,
                            inherited  : false,

                            clone : function( index ) {
                                var cloned = {
                                    index      : ( typeof index === 'number' ? index : this.index ),
                                    name       : this.name,
                                    mtllib     : this.mtllib,
                                    smooth     : this.smooth,
                                    groupStart : 0,
                                    groupEnd   : -1,
                                    groupCount : -1,
                                    inherited  : false
                                };
                                cloned.clone = this.clone.bind(cloned);
                                return cloned;
                            }
                        };

                        this.materials.push( material );

                        return material;

                    },

                    currentMaterial : function() {

                        if ( this.materials.length > 0 ) {
                            return this.materials[ this.materials.length - 1 ];
                        }

                        return undefined;

                    },

                    _finalize : function( end ) {

                        var lastMultiMaterial = this.currentMaterial();
                        if ( lastMultiMaterial && lastMultiMaterial.groupEnd === -1 ) {

                            lastMultiMaterial.groupEnd = this.geometry.vertices.length / 3;
                            lastMultiMaterial.groupCount = lastMultiMaterial.groupEnd - lastMultiMaterial.groupStart;
                            lastMultiMaterial.inherited = false;

                        }

                        // Ignore objects tail materials if no face declarations followed them before a new o/g started.
                        if ( end && this.materials.length > 1 ) {

                            for ( var mi = this.materials.length - 1; mi >= 0; mi-- ) {
                                if ( this.materials[mi].groupCount <= 0 ) {
                                    this.materials.splice( mi, 1 );
                                }
                            }

                        }

                        // Guarantee at least one empty material, this makes the creation later more straight forward.
                        if ( end && this.materials.length === 0 ) {

                            this.materials.push({
                                name   : '',
                                smooth : this.smooth
                            });

                        }

                        return lastMultiMaterial;

                    }
                };

                // Inherit previous objects material.
                // Spec tells us that a declared material must be set to all objects until a new material is declared.
                // If a usemtl declaration is encountered while this new object is being parsed, it will
                // overwrite the inherited material. Exception being that there was already face declarations
                // to the inherited material, then it will be preserved for proper MultiMaterial continuation.

                if ( previousMaterial && previousMaterial.name && typeof previousMaterial.clone === "function" ) {

                    var declared = previousMaterial.clone( 0 );
                    declared.inherited = true;
                    this.object.materials.push( declared );

                }

                this.objects.push( this.object );

            },

            finalize : function() {

                if ( this.object && typeof this.object._finalize === 'function' ) {

                    this.object._finalize( true );

                }
            },

            parseVertexIndex: function ( value, len ) {

                var index = parseInt( value, 10 );
                return ( index >= 0 ? index - 1 : index + len / 3 ) * 3;
            },

            parseNormalIndex: function ( value, len ) {

                var index = parseInt( value, 10 );
                return ( index >= 0 ? index - 1 : index + len / 3 ) * 3;
            },

            parseUVIndex: function ( value, len ) {

                var index = parseInt( value, 10 );
                return ( index >= 0 ? index - 1 : index + len / 2 ) * 2;
            },

            addVertex: function ( a, b, c ) {

                var src = this.vertices;
                var dst = this.object.geometry.vertices;

                dst.push( src[ a + 0 ] );
                dst.push( src[ a + 1 ] );
                dst.push( src[ a + 2 ] );
                dst.push( src[ b + 0 ] );
                dst.push( src[ b + 1 ] );
                dst.push( src[ b + 2 ] );
                dst.push( src[ c + 0 ] );
                dst.push( src[ c + 1 ] );
                dst.push( src[ c + 2 ] );
            },

            addVertexLine: function ( a ) {

                var src = this.vertices;
                var dst = this.object.geometry.vertices;

                dst.push( src[ a + 0 ] );
                dst.push( src[ a + 1 ] );
                dst.push( src[ a + 2 ] );
            },

            addNormal : function ( a, b, c ) {

                var src = this.normals;
                var dst = this.object.geometry.normals;

                dst.push( src[ a + 0 ] );
                dst.push( src[ a + 1 ] );
                dst.push( src[ a + 2 ] );
                dst.push( src[ b + 0 ] );
                dst.push( src[ b + 1 ] );
                dst.push( src[ b + 2 ] );
                dst.push( src[ c + 0 ] );
                dst.push( src[ c + 1 ] );
                dst.push( src[ c + 2 ] );
            },

            addUV: function ( a, b, c ) {

                var src = this.uvs;
                var dst = this.object.geometry.uvs;

                dst.push( src[ a + 0 ] );
                dst.push( src[ a + 1 ] );
                dst.push( src[ b + 0 ] );
                dst.push( src[ b + 1 ] );
                dst.push( src[ c + 0 ] );
                dst.push( src[ c + 1 ] );
            },

            addUVLine: function ( a ) {

                var src = this.uvs;
                var dst = this.object.geometry.uvs;

                dst.push( src[ a + 0 ] );
                dst.push( src[ a + 1 ] );
            },

            addFace: function ( a, b, c, d, ua, ub, uc, ud, na, nb, nc, nd ) {

                var vLen = this.vertices.length;

                var ia = this.parseVertexIndex( a, vLen );
                var ib = this.parseVertexIndex( b, vLen );
                var ic = this.parseVertexIndex( c, vLen );
                var id;

                if ( d === undefined ) {

                    this.addVertex( ia, ib, ic );

                } else {

                    id = this.parseVertexIndex( d, vLen );

                    this.addVertex( ia, ib, id );
                    this.addVertex( ib, ic, id );

                }

                if ( ua !== undefined ) {

                    var uvLen = this.uvs.length;

                    ia = this.parseUVIndex( ua, uvLen );
                    ib = this.parseUVIndex( ub, uvLen );
                    ic = this.parseUVIndex( uc, uvLen );

                    if ( d === undefined ) {

                        this.addUV( ia, ib, ic );

                    } else {

                        id = this.parseUVIndex( ud, uvLen );

                        this.addUV( ia, ib, id );
                        this.addUV( ib, ic, id );

                    }
                }

                if ( na !== undefined ) {

                    // Normals are many times the same. If so, skip function call and parseInt.
                    var nLen = this.normals.length;
                    ia = this.parseNormalIndex( na, nLen );

                    ib = na === nb ? ia : this.parseNormalIndex( nb, nLen );
                    ic = na === nc ? ia : this.parseNormalIndex( nc, nLen );

                    if ( d === undefined ) {

                        this.addNormal( ia, ib, ic );

                    } else {

                        id = this.parseNormalIndex( nd, nLen );

                        this.addNormal( ia, ib, id );
                        this.addNormal( ib, ic, id );

                    }

                }

            },

            addLineGeometry: function ( vertices, uvs ) {

                this.object.geometry.type = 'Line';

                var vLen = this.vertices.length;
                var uvLen = this.uvs.length;

                var vi = 0, uvi = 0, l = 0;

                for ( vi = 0, l = vertices.length; vi < l; vi ++ ) {

                    this.addVertexLine( this.parseVertexIndex( vertices[ vi ], vLen ) );

                }

                for ( uvi = 0, l = uvs.length; uvi < l; uvi ++ ) {

                    this.addUVLine( this.parseUVIndex( uvs[ uvi ], uvLen ) );

                }

            }

        };

        state.startObject( '', false );

        return state;
    };

    _self.getState = function ( text ) {

        console.time( 'OBJLoader' );

        var state = _self._createParserState();

        if ( text.indexOf( '\r\n' ) !== - 1 ) {

            // This is faster than String.split with regex that splits on both
            text = text.replace( /\r\n/g, '\n' );

        }

        if ( text.indexOf( '\\\n' ) !== - 1) {

            // join lines separated by a line continuation character (\)
            text = text.replace( /\\\n/g, '' );

        }

        var lines = text.split( '\n' );
        var line = '', lineFirstChar = '', lineSecondChar = '';
        var lineLength = 0;
        var result = [];

        // Faster to just trim left side of the line. Use if available.
        var trimLeft = ( typeof ''.trimLeft === 'function' );

        for ( var i = 0, l = lines.length; i < l; i ++ ) {

            line = lines[ i ];

            line = trimLeft ? line.trimLeft() : line.trim();

            lineLength = line.length;

            if ( lineLength === 0 ) continue;

            lineFirstChar = line.charAt( 0 );

            // @todo invoke passed in handler if any
            if ( lineFirstChar === '#' ) continue;

            if ( lineFirstChar === 'v' ) {

                lineSecondChar = line.charAt( 1 );

                if ( lineSecondChar === ' ' && ( result = _self.regexp.vertex_pattern.exec( line ) ) !== null ) {

                    // 0                  1      2      3
                    // ["v 1.0 2.0 3.0", "1.0", "2.0", "3.0"]

                    state.vertices.push(
                        parseFloat( result[ 1 ] ),
                        parseFloat( result[ 2 ] ),
                        parseFloat( result[ 3 ] )
                    );

                } else if ( lineSecondChar === 'n' && ( result = _self.regexp.normal_pattern.exec( line ) ) !== null ) {

                    // 0                   1      2      3
                    // ["vn 1.0 2.0 3.0", "1.0", "2.0", "3.0"]

                    state.normals.push(
                        parseFloat( result[ 1 ] ),
                        parseFloat( result[ 2 ] ),
                        parseFloat( result[ 3 ] )
                    );

                } else if ( lineSecondChar === 't' && ( result = _self.regexp.uv_pattern.exec( line ) ) !== null ) {

                    // 0               1      2
                    // ["vt 0.1 0.2", "0.1", "0.2"]

                    state.uvs.push(
                        parseFloat( result[ 1 ] ),
                        parseFloat( result[ 2 ] )
                    );

                } else {

                    throw new Error( "Unexpected vertex/normal/uv line: '" + line  + "'" );

                }

            } else if ( lineFirstChar === "f" ) {

                if ( ( result = _self.regexp.face_vertex_uv_normal.exec( line ) ) !== null ) {

                    // f vertex/uv/normal vertex/uv/normal vertex/uv/normal
                    // 0                        1    2    3    4    5    6    7    8    9   10         11         12
                    // ["f 1/1/1 2/2/2 3/3/3", "1", "1", "1", "2", "2", "2", "3", "3", "3", undefined, undefined, undefined]

                    state.addFace(
                        result[ 1 ], result[ 4 ], result[ 7 ], result[ 10 ],
                        result[ 2 ], result[ 5 ], result[ 8 ], result[ 11 ],
                        result[ 3 ], result[ 6 ], result[ 9 ], result[ 12 ]
                    );

                } else if ( ( result = _self.regexp.face_vertex_uv.exec( line ) ) !== null ) {

                    // f vertex/uv vertex/uv vertex/uv
                    // 0                  1    2    3    4    5    6   7          8
                    // ["f 1/1 2/2 3/3", "1", "1", "2", "2", "3", "3", undefined, undefined]

                    state.addFace(
                        result[ 1 ], result[ 3 ], result[ 5 ], result[ 7 ],
                        result[ 2 ], result[ 4 ], result[ 6 ], result[ 8 ]
                    );

                } else if ( ( result = _self.regexp.face_vertex_normal.exec( line ) ) !== null ) {

                    // f vertex//normal vertex//normal vertex//normal
                    // 0                     1    2    3    4    5    6   7          8
                    // ["f 1//1 2//2 3//3", "1", "1", "2", "2", "3", "3", undefined, undefined]

                    state.addFace(
                        result[ 1 ], result[ 3 ], result[ 5 ], result[ 7 ],
                        undefined, undefined, undefined, undefined,
                        result[ 2 ], result[ 4 ], result[ 6 ], result[ 8 ]
                    );

                } else if ( ( result = _self.regexp.face_vertex.exec( line ) ) !== null ) {

                    // f vertex vertex vertex
                    // 0            1    2    3   4
                    // ["f 1 2 3", "1", "2", "3", undefined]

                    state.addFace(
                        result[ 1 ], result[ 2 ], result[ 3 ], result[ 4 ]
                    );

                } else {

                    throw new Error( "Unexpected face line: '" + line  + "'" );

                }

            } else if ( lineFirstChar === "l" ) {

                var lineParts = line.substring( 1 ).trim().split( " " );
                var lineVertices = [], lineUVs = [];

                if ( line.indexOf( "/" ) === - 1 ) {

                    lineVertices = lineParts;

                } else {

                    for ( var li = 0, llen = lineParts.length; li < llen; li ++ ) {

                        var parts = lineParts[ li ].split( "/" );

                        if ( parts[ 0 ] !== "" ) lineVertices.push( parts[ 0 ] );
                        if ( parts[ 1 ] !== "" ) lineUVs.push( parts[ 1 ] );

                    }

                }
                state.addLineGeometry( lineVertices, lineUVs );

            } else if ( ( result = _self.regexp.object_pattern.exec( line ) ) !== null ) {

                // o object_name
                // or
                // g group_name

                // WORKAROUND: https://bugs.chromium.org/p/v8/issues/detail?id=2869
                // var name = result[ 0 ].substr( 1 ).trim();
                var name = ( " " + result[ 0 ].substr( 1 ).trim() ).substr( 1 );

                state.startObject( name );

            } else if ( _self.regexp.material_use_pattern.test( line ) ) {

                // material

                state.object.startMaterial( line.substring( 7 ).trim(), state.materialLibraries );

            } else if ( _self.regexp.material_library_pattern.test( line ) ) {

                // mtl file

                state.materialLibraries.push( line.substring( 7 ).trim() );

            } else if ( ( result = _self.regexp.smoothing_pattern.exec( line ) ) !== null ) {

                // smooth shading

                // @todo Handle files that have varying smooth values for a set of faces inside one geometry,
                // but does not define a usemtl for each face set.
                // This should be detected and a dummy material created (later MultiMaterial and geometry groups).
                // This requires some care to not create extra material on each smooth value for "normal" obj files.
                // where explicit usemtl defines geometry groups.
                // Example asset: examples/models/obj/cerberus/Cerberus.obj

                var value = result[ 1 ].trim().toLowerCase();
                state.object.smooth = ( value === '1' || value === 'on' );

                var material = state.object.currentMaterial();
                if ( material ) {

                    material.smooth = state.object.smooth;

                }

            } else {

                // Handle null terminated files without exception
                if ( line === '\0' ) continue;

                throw new Error( "Unexpected line: '" + line  + "'" );

            }

        }

        state.finalize();

        console.timeEnd( 'OBJLoader' );

        return state;
    };

    _self.procState = function( state ){

        var container = new THREE.Group();
        container.materialLibraries = [].concat( state.materialLibraries );

        for ( var i = 0, l = state.objects.length; i < l; i ++ ) {

            var object = state.objects[ i ];
            var geometry = object.geometry;
            var materials = object.materials;
            var isLine = ( geometry.type === 'Line' );

            // Skip o/g line declarations that did not follow with any faces
            if ( geometry.vertices.length === 0 ) continue;

            var buffergeometry = new THREE.BufferGeometry();

            buffergeometry.addAttribute( 'position', new THREE.BufferAttribute( new Float32Array( geometry.vertices ), 3 ) );

            if ( geometry.normals.length > 0 ) {

                buffergeometry.addAttribute( 'normal', new THREE.BufferAttribute( new Float32Array( geometry.normals ), 3 ) );

            } else {

                buffergeometry.computeVertexNormals();

            }

            if ( geometry.uvs.length > 0 ) {

                buffergeometry.addAttribute( 'uv', new THREE.BufferAttribute( new Float32Array( geometry.uvs ), 2 ) );

            }

            // Create materials

            var createdMaterials = [];

            var mi = 0, miLen = 0;

            var sourceMaterial = null;

            for ( mi = 0, miLen = materials.length; mi < miLen ; mi++ ) {

                sourceMaterial = materials[mi];
                var material = undefined;

                if ( _self.materials !== null ) {

                    material = _self.materials.create( sourceMaterial.name );

                    // mtl etc. loaders probably can't create line materials correctly, copy properties to a line material.
                    if ( isLine && material && ! ( material instanceof THREE.LineBasicMaterial ) ) {

                        var materialLine = new THREE.LineBasicMaterial();
                        materialLine.copy( material );
                        material = materialLine;

                    }

                }

                if ( ! material ) {

                    material = ( ! isLine ? new THREE.MeshPhongMaterial() : new THREE.LineBasicMaterial() );
                    material.name = sourceMaterial.name;

                }

                material.shading = sourceMaterial.smooth ? THREE.SmoothShading : THREE.FlatShading;

                createdMaterials.push(material);

            }

            // Create mesh

            var mesh;

            if ( createdMaterials.length > 1 ) {

                for ( mi = 0, miLen = materials.length; mi < miLen ; mi++ ) {

                    sourceMaterial = materials[mi];
                    buffergeometry.addGroup( sourceMaterial.groupStart, sourceMaterial.groupCount, mi );

                }

                mesh = ( ! isLine ? new THREE.Mesh( buffergeometry, createdMaterials ) : new THREE.LineSegments( buffergeometry, createdMaterials ) );

            } else {

                mesh = ( ! isLine ? new THREE.Mesh( buffergeometry, createdMaterials[ 0 ] ) : new THREE.LineSegments( buffergeometry, createdMaterials[ 0 ] ) );
            }

            mesh.name = object.name;

            container.add( mesh );

        }

        return container;
    };

    _self.onmessage = function (event) {

        if (event.data.msg === "parse_file") {   

            var state = _self.getState( event.data.obj_file );

            var simple_state = {};

            simple_state.objects = state.objects;
            simple_state.materialLibraries = state.materialLibraries;

            state = null;

            for ( var i = 0; i < simple_state.objects.length; i ++ ) {

                var object = simple_state.objects[ i ];
                delete object.currentMaterial;
                delete object.startMaterial;
                delete object._finalize;
                
                delete object.materials.startMaterial;
                delete object.materials._finalize;

                for (var j = 0 ; j < object.materials.length; j++){

                    var material = object.materials[j];

                    delete material.clone;
                }

                object = null;
            }

            _self.postMessage({msg:'parse_file_done', state : simple_state}); 
        }
    };
};


var ZipLoaderPool = function(){

    "use strict";

    /* global zip */

    var zip_workers_queue = [];
    var zip_workers_ative = 0;
    var zip_workers_max = 6;

    var xhrs_data = {};

    var workerURL_OBJCreator = URL.createObjectURL(new Blob([ '(',

        THREE.OBJWorkerLoader.toString(),
        
        ')()' ], { type: 'application/javascript' })
    );

    var workerURL_BlobUploader = URL.createObjectURL(new Blob([ '(',

        function () {
        // WORKER BODY THERE

             var _self;
            /* jshint ignore:start */
            _self = eval('self');
            /* jshint ignore:end */
           
            _self.onmessage = function (e) {
                
                //console.log("Worker : get a message ");

                if (e.data.msg === "upload_file") {   
                    
                    var xhr = new XMLHttpRequest();
                    xhr.open('GET', e.data.url, true);
                    xhr.responseType = e.data.responseType;

                    xhr.onprogress = function(event) {

                        _self.postMessage({msg:'upload_file_onprogress', loaded : event.loaded, total : event.total}); 
                    };

                    xhr.onreadystatechange = function () {

                        if (xhr.readyState==4 && xhr.status==200) {

                            //var fileReader = new FileReader();
                            //fileReader.onload = function() {
                            //    var arrayBuffer = this.result;
                            //    _self.postMessage({msg:'upload_file_done', blob : arrayBuffer}, [arrayBuffer]); 
                            //    arrayBuffer = null;
                            //    fileReader = null;
                            //
                            //};
                            //fileReader.readAsArrayBuffer(blob);

                            _self.postMessage({msg:'upload_file_done', blob : xhr.response}); 

                            xhr = null;
                        }
                    };
                    xhr.send();
                }
            };
            }.toString(),
    ')()' ], { type: 'application/javascript' })
    );

    function dispatch_UploadData_Event(){

        var loaded = 0, total = 0;
        var created_objects = 0, total_objects = 0;

        for (var _uuid in xhrs_data){
            if (xhrs_data[_uuid]){
                loaded += xhrs_data[_uuid].loaded;
                total += xhrs_data[_uuid].total;

                if (xhrs_data[_uuid].object_created)
                    created_objects++;
                total_objects++;
            }
        }

        var e = document.createEvent('Event');
        e.initEvent("UploadData.update", true, true);
        e.loaded = loaded;
        e.total = total;
        e.created_objects = created_objects;
        e.total_objects = total_objects;
        document.dispatchEvent(e);
    }

    this.OBJUploader = function(in_path, in_filename, in_lod_param, in_parent_object){

        var _self = this;

        _self.filename = in_filename;
        _self.path = in_path;
        _self.url = in_path + "/data/" + in_filename + "/" + in_lod_param.toFixed(3) + "/data.zip";

        var uuid = generateUUID();

        _self.load = function(){

            xhrs_data[uuid] = {
                loaded : 0,
                total : 0,
                object_created : false
            };

            var workerThread = new Worker(workerURL_BlobUploader);

            workerThread.onmessage = function (e) {

                if (e.data.msg === "upload_file_onprogress") {  

                    xhrs_data[uuid].loaded = e.data.loaded; // bytes
                    xhrs_data[uuid].total = e.data.total;
                    dispatch_UploadData_Event();
                }
                else if (e.data.msg === "upload_file_done") {  

                    workerThread.terminate();
                    workerThread = null;

                    createZipWorker(e.data.blob);

                    // TODO FIX WORKER QUEUE !
                    //zip_workers_queue.push(blob);
                    //zip_worker_interval = setInterval( function(){
                    //    if (zip_workers_queue.length && 
                    //        zip_workers_ative < zip_workers_max){
                    //        clearInterval(zip_worker_interval);
                    //        zip_worker_interval = 0;
                    //        createZipWorker(zip_workers_queue.shift());
                    //    }
                    //}, 15);
                }
            }; 

            workerThread.postMessage({ msg: 'upload_file', url : _self.url, responseType : "blob"});
        };

        _self.onLoad = function(_self){};

        // -----------------------------------------------------------

        var zip_reader, zip_reader_count = 0, zip_worker_interval = 0;
        var obj_file, mtl_file;

        function readZippedMtlData(text){
            zip_reader_count--;
            mtl_file = text;
            createObject();
        }

        function readZippedObjData(text){
            zip_reader_count--;
            obj_file = text;
            createObject();
        }

        function createObject(){

            if (zip_reader_count === 0){ // all files unzipped

                if (zip_reader){
                    zip_reader.close(function() { }); // onclose callback
                    zip_workers_ative--;
                    zip_reader = null;
                }

                if (obj_file && mtl_file){

                    if (!in_parent_object.shared_materials){

                        var mtlLoader = new THREE.MTLLoader();
                        mtlLoader.setTexturePath( _self.path + "/resources/");
                        var materials = mtlLoader.parse( mtl_file );

                        change_image_ref_to_png(materials.materialsInfo);
                        materials.preload();

                        in_parent_object.shared_materials = materials;
                    }

                    var objLoader = new THREE.OBJWorkerLoader();
                    objLoader.setMaterials( in_parent_object.shared_materials );
                    objLoader.setPath( _self.path );

                    var workerThread_ParseOBJ = new Worker(workerURL_OBJCreator);

                    workerThread_ParseOBJ.onmessage = function (e) {

                         if (e.data.msg === "parse_file_done") {  

                            workerThread_ParseOBJ.terminate();
                            workerThread_ParseOBJ = null;

                            var object = objLoader.procState( e.data.state );

                            object.position.set(0.0, 0.0, 0.0);
                            object.scale.set(1.0, 1.0, 1.0);

                            object.lod = in_lod_param;

                            in_parent_object.lod_objects[in_lod_param] = object;

                            object.traverseVisible(function(_this){
                                _this.onAfterRender = function( renderer, scene, camera, geometry, material, group ){
                                    in_parent_object.onAfterRender(in_parent_object, _this, renderer, scene, camera, geometry, material, group);
                                };
                            });

                            object.visible = false;

                            in_parent_object.add(object);

                            _self.onLoad(_self);

                            xhrs_data[uuid].object_created = true;

                            dispatch_UploadData_Event();

                            mtl_file = null;
                            obj_file = null;
                        }
                    }; 

                    workerThread_ParseOBJ.postMessage({ msg: 'parse_file', obj_file : obj_file});
                }
            }
        }

        function createZipWorker(blob){

            zip_workers_ative++;

            zip.createReader(
                new zip.BlobReader(blob),

                function(reader) {

                    zip_reader = reader;

                    reader.getEntries( function(entries) {

                        if (entries.length) {

                            for (var i = 0; i < entries.length; i++){

                                var filename = entries[i].filename;

                                if (/\.mtl$/.test(filename)){
                                    zip_reader_count++;
                                    entries[i].getData(
                                        new zip.TextWriter(),
                                        readZippedMtlData,
                                        null // onprogress callback
                                    );
                                }
                                else if (/\.obj$/.test(filename)){
                                    zip_reader_count++;
                                    entries[i].getData(
                                        new zip.TextWriter(),
                                        readZippedObjData,
                                        null // onprogress callback
                                    );
                                }
                            }

                            if (zip_reader_count < 2){
                                reader.close(function() { }); // onclose callback
                                zip_reader = null;
                                zip_workers_ative--;
                            }

                            if (zip_reader_count > 2)
                                console.error("zip_reader_count > 2");
                        }
                    });
                },
                function(error) {}  // onerror callback
            );
        }

        function change_image_ref_to_png(mat_info_collection){
            var bDisableBumpMapping = true;
            for ( var mat_info_prop in mat_info_collection ) {
                if (!mat_info_collection.hasOwnProperty(mat_info_prop))
                    continue;
                var mat_info = mat_info_collection[mat_info_prop];
                for ( var prop in mat_info ) {
                    if (!mat_info.hasOwnProperty(prop))
                        continue;
                    var value = mat_info[ prop ];
                    if ( value === '' ) 
                        continue;
                    switch ( prop.toLowerCase() ) {
                        case 'map_kd':
                        case 'map_ks':
                            mat_info[ prop ] = value.replace(/\.[^/.]+$/, "") + ".png";
                            break;
                        case 'map_bump':
                        case 'bump':
                            if (bDisableBumpMapping){
                                delete mat_info[prop];
                            }
                            else
                                mat_info[ prop ] = value.replace(/\.[^/.]+$/, "") + ".png";
                            break;
                        default:
                            break;
                    }
                }
            }
        }
    };

    var generateUUID = function () {

        // http://www.broofa.com/Tools/Math.uuid.htm

        var chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split( '' );
        var uuid = new Array( 36 );
        var rnd = 0, r;

        return function generateUUID() {

            for ( var i = 0; i < 36; i ++ ) {

                if ( i === 8 || i === 13 || i === 18 || i === 23 ) {

                    uuid[ i ] = '-';

                } else if ( i === 14 ) {

                    uuid[ i ] = '4';

                } else {

                    if ( rnd <= 0x02 ) rnd = 0x2000000 + ( Math.random() * 0x1000000 ) | 0;
                    r = rnd & 0xf;
                    rnd = rnd >> 4;
                    uuid[ i ] = chars[ ( i === 19 ) ? ( r & 0x3 ) | 0x8 : r ];

                }

            }

            return uuid.join( '' );

        };

    }();
};
var ZipLoaderPool = new ZipLoaderPool();

function main(){
    "use strict";

    /* global zip */

    // set up zip worker

    zip.workerScriptsPath = "/zip-lib/";

    // set up three.js

    var camera = new THREE.PerspectiveCamera( 30, window.innerWidth / window.innerHeight, 0.1, 10000 );
    camera.position.set(0, 3, 30);
    camera.lookAt(new THREE.Vector3(0,2,0));

    var scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xf7f7f7, 0.0003);
    scene.add( new THREE.AmbientLight( 0x444444 ) );
    var scene_lods = [];

    var light1 = new THREE.DirectionalLight( 0xffffff, 1.0 );
    light1.position.set( 1, 1, -1 );
    scene.add( light1 );

    var light2 = new THREE.DirectionalLight( 0xffffff, 1.0 );
    light2.position.set( -1, -1, 1 );
    scene.add( light2 );

    var renderer = new THREE.WebGLRenderer( { antialias: false } );
    renderer.setClearColor( scene.fog.color );
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( window.innerWidth, window.innerHeight);

    var bRedraw = false;

    var container = document.getElementById( 'vida.web.container');
    renderer.domElement.style.zIndex = 1;
    container.appendChild( renderer.domElement );

    var _debug = true;

    var controls, input_container = renderer.domElement;

    var debug_canvas;

    if (true){
        debug_canvas = document.createElement('canvas');
        container.appendChild(debug_canvas);
        debug_canvas.style.position = 'absolute';
        debug_canvas.style.zIndex = 2;
        debug_canvas.style.top =renderer.domElement.offsetTop + "px";
        debug_canvas.style.left =renderer.domElement.offsetLeft + "px";
        debug_canvas.width = renderer.domElement.width;
        debug_canvas.height = renderer.domElement.height;

        var debug_canvas_observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                if (mutation.type === "attributes") {
                    debug_canvas.style.top =renderer.domElement.offsetTop + "px";
                    debug_canvas.style.left =renderer.domElement.offsetLeft + "px";
                    debug_canvas.width = renderer.domElement.width;
                    debug_canvas.height = renderer.domElement.height;
                }
            });
        });
        debug_canvas_observer.observe(renderer.domElement, { attributes: true });
        input_container = debug_canvas;
    }

    function preventDefault_handler(event) {
        if (event && event.preventDefault)
            event.preventDefault();
    }
    input_container.addEventListener( 'touchstart', preventDefault_handler, false );
    input_container.addEventListener( 'touchend', preventDefault_handler, false );
    input_container.addEventListener( 'touchmove', preventDefault_handler, false );

    document.addEventListener('touchstart', preventDefault_handler, false);
    document.addEventListener('touchmove', preventDefault_handler, false);

    controls = new THREE.TrackballControls( camera, input_container );
    controls.rotateSpeed = 10.0;
    controls.zoomSpeed = 1.5;
    controls.panSpeed = 0.8;
    controls.noZoom = false;
    controls.noPan = false;
    controls.staticMoving = true;
    controls.dynamicDampingFactor = 0.3;
    controls.keys = [ 65, 83, 68 ];
    controls.addEventListener( 'change', update_nexus_frame );

    // Prepare clock
    var clock = new THREE.Clock();

    // Prepare stats
    var stats;
    if (_debug){
        stats = new Stats();
        stats.domElement.style.position = 'absolute';
        stats.domElement.style.left = '20px';
        stats.domElement.style.bottom = '20px';
        stats.domElement.style.zIndex = 1;
        container.appendChild( stats.domElement );
    }

    if (false){
        scene.add( new THREE.AxisHelper( 15 ) );
        scene.add( new THREE.GridHelper( 35, 35 ) );
    }

    function getURLParameter(name) {
        return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(window.location.search) || [null, ''])[1].replace(/\+/g, '%20')) || null;
    }

    function onWindowResize() {

        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();

        renderer.setSize( window.innerWidth, window.innerHeight );

        update_nexus_frame();
    }
    window.addEventListener( 'resize', onWindowResize, false );

    function animate() {

        var delta = clock.getDelta();

        requestAnimationFrame( animate );

        if (stats)
            stats.update();

        if (controls)
            controls.update(delta);

        Nexus.debug_draw_wirefame = DEBUG.bUseWireframe;

        var nexus_context = null;

        bRedraw = true; // TODO

        if (bRedraw){

            if (Nexus && Nexus.contexts)
                Nexus.contexts.forEach(function(g) { 
                    if(g.gl == renderer.context) {
                        nexus_context = g;
                    }
                });

            if (nexus_context){
                nexus_context.rendered = 0;
            }

            for (var i = 0; i < scene_lods.length; i++){

                var object = scene_lods[i];

                for (var lodId in object.lod_objects){
                    if (object.lod_objects[lodId]){
                        object.lod_objects[lodId].visible = false;
                    }
                }

                if (object.lod_objects[object.lod_desired]){
                    object.lod_objects[object.lod_desired].visible = true;
                }
                else {

                    var start_indx = available_lods.indexOf(object.lod_desired);

                    for ( var j = start_indx - 1; j >= 0; j--){

                        var lod = available_lods[j];

                        if (object.lod_objects[lod]){
                            object.lod_objects[lod].visible = true;
                            break;
                        }
                    }
                }

                object.lod_desired = available_lods[0]; // reset LOD - will be set in onAfterRender
            }

            Nexus.beginFrame(renderer.context);

            renderer.render( scene, camera );

            if (false && debug_canvas)
                renderDebugCanvas(debug_canvas, scene_lods);

            Nexus.endFrame(renderer.context);

            updateContextInfo(renderer, nexus_context);
        }

        bRedraw = false;
    }

    function renderDebugCanvas(debug_canvas, scene){

        var ctx = debug_canvas.getContext('2d');

        ctx.font = '13px serif';

        ctx.clearRect(0, 0, debug_canvas.width, debug_canvas.height);

        for (var i = 0; i < scene_lods.length; i++){
            var lod = available_lods[0];
            var object = scene_lods[i];
            object.children = object.lod_objects[lod] ? [object.lod_objects[lod]] : [];

            var mesh = object.children[0] ? object.children[0].children[0] : null;

            if (mesh && mesh.geometry.boundingSphere){

                var sphere = mesh.geometry.boundingSphere;

                var center = toScreenPosition(sphere.center, camera, debug_canvas);
                var radius = toScreenLength(sphere.radius, camera, debug_canvas);

                ctx.beginPath();
                ctx.arc( center.x, center.y, radius, 0, 2 * Math.PI );
                ctx.stroke();

                //ctx.fillText( object.name, center.x, center.y);
            }
        }
    }

    function toScreenPosition(position, camera, canvas){
        var vector = new THREE.Vector3(position.x, position.y, position.z);
        var widthHalf = 0.5 * canvas.width;
        var heightHalf = 0.5 * canvas.height;
        vector.project(camera);
        vector.x = ( vector.x * widthHalf ) + widthHalf;
        vector.y = - ( vector.y * heightHalf ) + heightHalf;
        return { x : vector.x, y : vector.y };
    }

    function toScreenLength(length_units, camera, canvas){
        var xAxis = new THREE.Vector3(0, 0, 0);
        var yAxis = new THREE.Vector3(0, 0, 0);
        var zAxis = new THREE.Vector3(0, 0, 0);
        camera.matrixWorld.extractBasis(xAxis, yAxis, zAxis);
        var widthHalf = 0.5 * canvas.width;
        var heightHalf = 0.5 * canvas.height;
        var z = new THREE.Vector3(0, 0, 0);
        z.project(camera);
        z.x = ( z.x * widthHalf ) + widthHalf;
        z.y = - ( z.y * heightHalf ) + heightHalf;
        var v = new THREE.Vector3(length_units * yAxis.x, length_units * yAxis.y, length_units * yAxis.z);
        v.project(camera);
        v.x = ( v.x * widthHalf ) + widthHalf;
        v.y = - ( v.y * heightHalf ) + heightHalf;
        v.x = v.x - z.x;
        v.y = v.y - z.y;
        var l = Math.sqrt(v.x * v.x + v.y * v.y);
        return l;
    }

    function updateContextInfo( renderer, nexus_context ) {

        var info = {
            faces : 0
        };

        var faces = 0;

        if (renderer)
            info.faces += Math.round( renderer.info.render.faces );

        if (nexus_context)
            info.faces += Math.round( nexus_context.rendered / 3 );

        var e = document.createEvent('Event');
        e.initEvent("ContextInfo.update", true, true);
        e.info = info;
        document.dispatchEvent(e);
    }

    function update_nexus_frame() {
        bRedraw = true;
    }

    var onProgress = function ( xhr ) {
        if ( xhr.lengthComputable ) {
            var percentComplete = xhr.loaded / xhr.total * 100;
            console.log( Math.round(percentComplete, 2) + '% downloaded' );
        }
    };

    var onError = function ( xhr ) { };

    THREE.Loader.Handlers.add( /\.dds$/i, new THREE.DDSLoader() );

    function uploadNxs(path, filename){
        var nexus_obj = new NexusObject(path + filename + ".nxs", renderer, update_nexus_frame);
        nexus_obj.position.set(0.0, 0.0, 0.0);
        nexus_obj.scale.set(1.0, 1.0, 1.0);
        scene.add(nexus_obj);
    }

    animate();

    var page = 'HumanBody-FullBody-insane';

    var upload_format = getURLParameter("format") || 'obj';

    page += "-" + upload_format;
    
    var  xmlhttp = new XMLHttpRequest();

    xmlhttp.open("GET", document.location.origin + "/format/" + upload_format +"/page/" + page, true);

    function updateLOD(object, mesh, renderer, scene, camera, geometry, material, group ){

        var sphere = mesh.geometry.boundingSphere;
        var radius = toScreenLength(sphere.radius, camera, debug_canvas);

        if (mesh.material){
            mesh.material.wireframe = DEBUG.bUseWireframe;
        }

        var size = renderer.getSize();

        var mult = DEBUG.bIsMobile ? 4 : 1;
 
        var resolution = Math.sqrt( size.width * size.width + size.height + size.height ) * mult;

        var parameter = radius / resolution;

        if (DEBUG.bUseMaxLod)
            object.lod_desired = available_lods[available_lods.length - 1];

        if ( parameter <= 0.1){
            if (object.lod_desired < available_lods[0])
                object.lod_desired = available_lods[0];
        }
        else if ( parameter <= 0.2){
            if (object.lod_desired < available_lods[1])
                object.lod_desired = available_lods[1];
        }
        else if ( parameter <= 0.3){
            if (object.lod_desired < available_lods[2])
                object.lod_desired = available_lods[2];
        }
        else if ( parameter > 0.3){
            if (object.lod_desired < available_lods[3])
                object.lod_desired = available_lods[3];
        }

        if (!object.lod_upload_state[object.lod_desired]){

            object.lod_upload_state[object.lod_desired] = true;
            var uploader = new ZipLoaderPool.OBJUploader( object.path, object.name, object.lod_desired , object);
            uploader.onLoad = function(){
                bRedraw = true;
            };
            uploader.load();
        }
    }

    function uploadOBJ(path, model_name){
    
        var min_lod = available_lods[0];

        var object = new THREE.Object3D();
        object.path = path;
        object.name = model_name;
        object.shared_materials = null;
        object.lod_objects = {};
        object.lod_upload_state = { };
        object.lod_desired = min_lod;

        object.onAfterRender = updateLOD;

        object.lod_upload_state[min_lod] = true;
        var uploader = new ZipLoaderPool.OBJUploader( path, model_name, min_lod , object);
        uploader.onLoad = function(){
            bRedraw = true;
        };
        uploader.load();

        scene_lods.push(object);
        scene.add(object);
    }

    xmlhttp.onreadystatechange=function(){

        try{
            if (xmlhttp.readyState==4 && xmlhttp.status==200){

                var models = JSON.parse(xmlhttp.responseText);

                for ( var i = 0; i < models.length; i++)//
                {
                    var path = "models/" + page + "/";
                    var model_name = models[i];

                    if (upload_format === "nxs") {

                        uploadNxs( path, model_name);
                    }
                    else if (upload_format === "obj"){

                        uploadOBJ(window.location.href + path, model_name);

                    }
                    //else if (upload_format === "crt"){
                    //   if (models[i] === "Digestive.Digestive_exterior.Jejunum")
                    //        uploadCrt( path, models[i]);
                    //}
                }
            }
        }
        catch(expt) // 
        {
            console.log(expt);
        }
    };
    xmlhttp.send();
}
main();