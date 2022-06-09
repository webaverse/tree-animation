import * as THREE from 'three';
import metaversefile from 'metaversefile';


const {useApp, useFrame, useLoaders, usePhysics, useCleanup, useLocalPlayer, useActivate} = metaversefile;

const baseUrl = import.meta.url.replace(/(\/)[^\/\/]*$/, '$1'); 


export default () => {  
    let windZones = [];
    let windZoneFreq = 0;
    let windZoneForce = 0;

    const app = useApp();
    let treeMesh = null;
    const physics = usePhysics();
    const physicsIds = [];
    let treeTexture = null;

    (async () => {
        const u = `${baseUrl}/Webaverse_TreeForrest_Tree1_vine_leaf.glb`;
        const tree = await new Promise((accept, reject) => {
            const {gltfLoader} = useLoaders();
            gltfLoader.load(u, accept, function onprogress() {}, reject);
            
        });
        tree.scene.traverse(o => { 
          if (o.isMesh && treeMesh === null) {
            console.log(o);
            o.castShadow = true;
            o.receiveShadow = true;
            treeTexture = o.material.map;
            treeMesh = o;
            o.geometry.setAttribute(
                'vertexColor',
                new THREE.BufferAttribute(new Uint16Array(o.geometry.attributes.color.array.length), 4)
            );
            const vertexColorAttribute = o.geometry.getAttribute('vertexColor');
            for(let i = 0; i < o.geometry.attributes.color.array.length; i++){
                o.geometry.attributes.vertexColor.array[i] = o.geometry.attributes.color.array[i];
            }
            vertexColorAttribute.needsUpdate = true;
            o.geometry.attributes.vertexColor.normalized = true;
            treeMesh.frustumCulled = false;
            treeMesh.material= new THREE.ShaderMaterial({
                uniforms: {
                    uTime: {
                        value: 0,
                    },
                    treeTexture:{
                        value: treeTexture
                    },
                    uWindRotation: {
                        value: 0,
                    },
                    uWindZoneFreq: {
                        value: windZoneFreq,
                    },
                    uWindZoneForce: {
                        value: windZoneForce,
                    },
                },
                vertexShader: `\
                    
                    ${THREE.ShaderChunk.common}
                    ${THREE.ShaderChunk.logdepthbuf_pars_vertex}
                
                    attribute vec4 vertexColor;

                    uniform float uTime;
                    uniform sampler2D noiseTexture;
                    uniform float uWindRotation;
                    uniform float uWindZoneFreq;
                    uniform float uWindZoneForce;

                    varying vec2 vUv;
                    varying vec3 vPos;
                    varying vec4 vColor;

                    vec4 quat_from_axis_angle(vec3 axis, float angle) { 
                        vec4 qr;
                        float half_angle = (angle * 0.5);
                        qr.x = axis.x * sin(half_angle);
                        qr.y = axis.y * sin(half_angle);
                        qr.z = axis.z * sin(half_angle);
                        qr.w = cos(half_angle);
                        return qr;
                    }
            
                    vec3 rotate_vertex_position(vec3 position, vec4 q) { 
                        return position + 2.0 * cross(q.xyz, cross(q.xyz, position) + q.w * position);
                    }
    
                    vec3 permute(in vec3 x) { return mod( x*x*34.+x, 289.); }

                    float snoise(in vec2 v) {
                        vec2 i = floor((v.x+v.y)*.36602540378443 + v),
                            x0 = (i.x+i.y)*.211324865405187 + v - i;
                        float s = step(x0.x,x0.y);
                        vec2 j = vec2(1.0-s,s),
                            x1 = x0 - j + .211324865405187, 
                            x3 = x0 - .577350269189626; 
                        i = mod(i,289.);
                        vec3 p = permute( permute( i.y + vec3(0, j.y, 1 ))+ i.x + vec3(0, j.x, 1 )   ),
                            m = max( .5 - vec3(dot(x0,x0), dot(x1,x1), dot(x3,x3)), 0.),
                            x = fract(p * .024390243902439) * 2. - 1.,
                            h = abs(x) - .5,
                            a0 = x - floor(x + .5);
                        return .5 + 65. * dot( pow(m,vec3(4.))*(- 0.85373472095314*( a0*a0 + h*h )+1.79284291400159 ), a0 * vec3(x0.x,x1.x,x3.x) + h * vec3(x0.y,x1.y,x3.y));
                    }

                    void main() {
                        vColor = vertexColor;
                        vUv = uv;
                        vPos = position;

                        vec3 pos = position;
                        
                        
                        float windOffsetX = snoise(
                            vec2(
                                25. * vUv.x + uTime * 0.06 * uWindZoneFreq * 1.,
                                25. * vUv.y + uTime * uWindZoneFreq * 1.
                            )
                        ) * 1.;
                        float windOffsetY = snoise(
                            vec2(
                                25. * vUv.x + uTime * 0.06 * uWindZoneFreq * 1.,
                                25. * vUv.y + uTime * uWindZoneFreq * 1.
                            )
                        ) * 1.;
                        float windOffsetZ = snoise(
                            vec2(
                                25. * vUv.x + uTime * 0.06 * uWindZoneFreq * 1.,
                                25. * vUv.y + uTime * uWindZoneFreq * 1.
                            )
                        ) * 1.;

                        // red color define the foliage, the outer vertices of the leaf should have more red value.
                        // make sure only foliage have red value.
                        vec3 windOffset = vec3(windOffsetX, windOffsetY, windOffsetZ);
                        pos += windOffset * (vertexColor.r * vertexColor.g) * 0.05 * uWindZoneForce;

                        // green value is the offset to desynchronize the rotation of the tree,
                        // we should assign different branches and corresponding foliage chunks with unique green values
                        // and make sure to paint connected pieces with the same color to avoid breaks in the mesh
                        float offsetIntensity = 100.;
                        float bendNoise = snoise(
                            vec2(
                                uTime * 0.06 * 0.5,
                                uTime * 0.5
                            )
                        ) * 1.;

                        vec3 bendOffset = vec3((0.1 + vertexColor.g) * offsetIntensity * bendNoise, 0, 0);
                        vec4 q2 = quat_from_axis_angle(vec3(0., 1., 0.), uWindRotation);
                        bendOffset = rotate_vertex_position(bendOffset / offsetIntensity, q2);

                        // blue value define the bendable part
                        // make sure to paint it with the same color horizontally to avoid breaks in the mesh
                        // make sure to paint it with linear gradient vertically to make the rotation smoothly
                        float bendable = vertexColor.b > 0. ? 1. : 0.;
                        pos += bendOffset * 0.07 * bendable;
                        
                        
                        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                        gl_Position = projectionMatrix * mvPosition;
                        ${THREE.ShaderChunk.logdepthbuf_vertex}
                    }
                `,
                fragmentShader: `\
                    ${THREE.ShaderChunk.logdepthbuf_pars_fragment}
                    uniform float uTime;
                    varying vec2 vUv;
                    varying vec3 vPos;
                    varying vec4 vColor;
                    uniform sampler2D treeTexture;
                    uniform sampler2D noiseTexture;
                    
    
                    void main() {
                        vec4 tree = texture2D(
                            treeTexture,
                            vUv
                        );
                        if(tree.a < 0.5){
                            discard;
                        }
                        gl_FragColor = tree;
                        gl_FragColor.a = 1.0;
                    ${THREE.ShaderChunk.logdepthbuf_fragment}
                    }
                `,
                side: THREE.DoubleSide,
                transparent: true,
                //depthWrite: false,
                //blending: 1,
    
                clipping: false,
                fog: false,
                lights: false,
            });
          }
        });
        
        app.add(treeMesh);
        // let physicsId;
        // physicsId = physics.addGeometry(tree.scene);
        // physicsIds.push(physicsId)
        app.updateMatrixWorld();

        

    })();
    let lastLength = 0;
    useFrame(({timestamp}) => {
        windZones = metaversefile.getWinds();
        if(lastLength !== windZones.length){
            for(const wind of windZones){
                if(wind.windType === 'directional'){
                    windZoneFreq = wind.windFrequency;
                    windZoneForce =  wind.windForce;
                    break;
                }
            }
            lastLength = windZones.length;
        }
        if(treeMesh){
            treeMesh.material.uniforms.uTime.value = timestamp /1000;
            treeMesh.material.uniforms.uWindRotation.value = ((timestamp /5000) % 1) * Math.PI * 2;
            treeMesh.material.uniforms.uWindZoneFreq.value = windZoneFreq;
            treeMesh.material.uniforms.uWindZoneForce.value = windZoneForce;
        }
        app.updateMatrixWorld();
    
    });

    
    useCleanup(() => {
      for (const physicsId of physicsIds) {
        physics.removeGeometry(physicsId);
      }
    });

    return app;
}