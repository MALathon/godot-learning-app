export interface CodeExample {
	title: string;
	language: 'gdscript' | 'typescript' | 'python' | 'cpp';
	code: string;
	explanation: string;
}

export interface Resource {
	title: string;
	url: string;
	type: 'docs' | 'source' | 'book' | 'video';
}

export interface Topic {
	id: string;
	title: string;
	category: 'fundamentals' | 'architecture' | 'patterns' | 'internals';
	description: string;
	keyPoints: string[];
	codeExamples: CodeExample[];
	resources: Resource[];
	godotConnection: string;
	exercises: string[];
}

export const topics: Topic[] = [
	{
		id: 'game-loop',
		title: 'The Game Loop',
		category: 'fundamentals',
		description: 'The heart of every game engine - a continuous cycle of input, update, and render that drives everything.',
		keyPoints: [
			'Fixed timestep vs variable timestep',
			'Input → Process → Physics → Render pipeline',
			'Delta time for frame-independent movement',
			'Why physics runs at fixed intervals (determinism)',
			'Frame budget and target FPS'
		],
		codeExamples: [
			{
				title: 'Basic Game Loop (Pseudocode)',
				language: 'python',
				code: `while game_running:
    delta_time = calculate_delta()

    # 1. Input
    process_input()

    # 2. Update game state
    update(delta_time)

    # 3. Physics (fixed timestep)
    accumulator += delta_time
    while accumulator >= PHYSICS_STEP:
        physics_update(PHYSICS_STEP)
        accumulator -= PHYSICS_STEP

    # 4. Render
    render()`,
				explanation: 'The accumulator pattern ensures physics runs at consistent intervals regardless of frame rate. This is crucial for deterministic physics.'
			},
			{
				title: 'Godot\'s Built-in Callbacks',
				language: 'gdscript',
				code: `extends Node2D

func _ready():
    # Called once when node enters scene tree
    pass

func _process(delta):
    # Called every frame - use for visual updates
    position.x += speed * delta

func _physics_process(delta):
    # Called at fixed intervals (60 Hz default)
    # Use for physics/collision logic
    velocity = move_and_slide()

func _input(event):
    # Called on input events
    if event.is_action_pressed("jump"):
        jump()`,
				explanation: 'Godot abstracts the game loop - you just implement callbacks. _process for rendering logic, _physics_process for physics (runs at fixed 60 Hz by default).'
			}
		],
		resources: [
			{
				title: 'Fix Your Timestep! (Classic Article)',
				url: 'https://gafferongames.com/post/fix_your_timestep/',
				type: 'docs'
			},
			{
				title: 'Godot Main Loop Source',
				url: 'https://github.com/godotengine/godot/blob/master/main/main_loop.cpp',
				type: 'source'
			},
			{
				title: 'Game Programming Patterns - Game Loop',
				url: 'https://gameprogrammingpatterns.com/game-loop.html',
				type: 'book'
			}
		],
		godotConnection: 'Godot handles the game loop internally. Your _process() runs in the update phase, _physics_process() in the physics phase. Understanding this helps you know WHERE to put code.',
		exercises: [
			'Print delta time in _process() and observe how it varies',
			'Move an object in _process() with and without delta - see the difference',
			'Compare behavior of code in _process() vs _physics_process()'
		]
	},
	{
		id: 'scene-tree',
		title: 'Scene Trees & Hierarchies',
		category: 'architecture',
		description: 'How Godot organizes game objects in a tree structure, enabling composition and inheritance of transforms.',
		keyPoints: [
			'Parent-child relationships for transform inheritance',
			'Scene composition: scenes within scenes',
			'The SceneTree as global game state manager',
			'Node lifecycle: _enter_tree, _ready, _exit_tree',
			'Groups for cross-cutting organization'
		],
		codeExamples: [
			{
				title: 'Scene Tree Traversal',
				language: 'gdscript',
				code: `extends Node

func _ready():
    # Access parent
    var parent = get_parent()

    # Access children
    for child in get_children():
        print(child.name)

    # Find node by path
    var player = get_node("Player")
    # or shorthand
    var enemy = $Enemies/Boss

    # Get root of tree
    var root = get_tree().root

    # Process groups
    get_tree().call_group("enemies", "take_damage", 10)`,
				explanation: 'The scene tree is your navigation system. Every node knows its parent and children. Paths work like file paths.'
			},
			{
				title: 'Transform Inheritance',
				language: 'gdscript',
				code: `# Player.gd
extends CharacterBody2D

# Children inherit parent transforms!
# If Player moves, Weapon moves with it

func _ready():
    # Local position (relative to parent)
    $Weapon.position = Vector2(20, 0)

    # Global position (world coordinates)
    var world_pos = $Weapon.global_position

    # This is why hierarchy matters:
    # Parent rotation rotates all children
    rotation = PI / 4  # Weapon rotates too!`,
				explanation: 'Child nodes inherit parent transforms. Move a spaceship, its turrets move too. This is the power of hierarchical scene trees.'
			}
		],
		resources: [
			{
				title: 'Godot Docs: Scene Tree',
				url: 'https://docs.godotengine.org/en/stable/tutorials/scripting/scene_tree.html',
				type: 'docs'
			},
			{
				title: 'SceneTree Source Code',
				url: 'https://github.com/godotengine/godot/blob/master/scene/main/scene_tree.cpp',
				type: 'source'
			}
		],
		godotConnection: 'Godot\'s "scenes" are really just subtrees you can instance. Your TicTacToe board is a scene containing square scenes. This is composition over inheritance.',
		exercises: [
			'Print the full tree structure with a recursive function',
			'Move a parent and watch children follow',
			'Use groups to manage all enemies at once'
		]
	},
	{
		id: 'signals',
		title: 'Signals (Observer Pattern)',
		category: 'patterns',
		description: 'Decoupled communication between objects. Emitters don\'t need to know who\'s listening.',
		keyPoints: [
			'Publish-subscribe pattern for loose coupling',
			'Emitter defines signal, doesn\'t know listeners',
			'Connections can be made in editor or code',
			'Built-in signals vs custom signals',
			'One-to-many communication'
		],
		codeExamples: [
			{
				title: 'Custom Signal Definition',
				language: 'gdscript',
				code: `# Square.gd
extends Area2D
class_name TicTacToeSquare

# Define signal with parameters
signal square_clicked(square)
signal state_changed(old_state, new_state)

var state: int = 0

func _on_input_event(_viewport, event, _idx):
    if event is InputEventMouseButton:
        if event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
            # Emit signal - we don't care who listens
            square_clicked.emit(self)

func set_state(new_state: int):
    var old = state
    state = new_state
    state_changed.emit(old, new_state)`,
				explanation: 'The square doesn\'t know about the board. It just announces "I was clicked!" Anyone interested can listen.'
			},
			{
				title: 'Connecting Signals',
				language: 'gdscript',
				code: `# Board.gd
extends Node2D

func _ready():
    # Create squares and connect their signals
    for i in range(9):
        var square = Square_scn.instantiate()
        add_child(square)

        # Connect signal to our handler
        square.square_clicked.connect(_on_square_clicked)

        # Can also use lambdas
        square.state_changed.connect(func(old, new):
            print("Square changed from %d to %d" % [old, new])
        )

func _on_square_clicked(square):
    # Handle the click
    if is_valid_move(square):
        square.set_state(current_player)`,
				explanation: 'The board connects to square signals. Squares remain independent - they just emit events. Board decides what to do.'
			},
			{
				title: 'Observer Pattern (Generic)',
				language: 'python',
				code: `# The pattern Godot signals implement:
class EventEmitter:
    def __init__(self):
        self._listeners = {}

    def on(self, event: str, callback):
        if event not in self._listeners:
            self._listeners[event] = []
        self._listeners[event].append(callback)

    def emit(self, event: str, *args):
        for callback in self._listeners.get(event, []):
            callback(*args)

# Usage
button = EventEmitter()
button.on("clicked", lambda: print("Button was clicked!"))
button.on("clicked", lambda: play_sound("click"))
button.emit("clicked")  # Both handlers run`,
				explanation: 'This is the Observer pattern that signals implement. The emitter maintains a list of callbacks and invokes them all when an event occurs.'
			}
		],
		resources: [
			{
				title: 'Game Programming Patterns - Observer',
				url: 'https://gameprogrammingpatterns.com/observer.html',
				type: 'book'
			},
			{
				title: 'Godot Docs: Signals',
				url: 'https://docs.godotengine.org/en/stable/getting_started/step_by_step/signals.html',
				type: 'docs'
			}
		],
		godotConnection: 'Your tic-tac-toe squares use signals! square_clicked.emit(self) lets the board know a square was clicked without the square needing a reference to the board.',
		exercises: [
			'Create a health component that emits "health_changed" and "died" signals',
			'Connect multiple listeners to one signal',
			'Disconnect a signal dynamically'
		]
	},
	{
		id: 'nodes-resources',
		title: 'Nodes vs Resources',
		category: 'architecture',
		description: 'Understanding the two fundamental types in Godot: Nodes (scene tree items) and Resources (shared data).',
		keyPoints: [
			'Nodes: exist in scene tree, have transforms, process every frame',
			'Resources: pure data, shared by reference, no scene tree presence',
			'Resources for shared configuration (stats, items, settings)',
			'Nodes for active game objects (players, enemies, UI)',
			'Instancing vs referencing'
		],
		codeExamples: [
			{
				title: 'Resource for Shared Data',
				language: 'gdscript',
				code: `# weapon_stats.gd
extends Resource
class_name WeaponStats

@export var damage: int = 10
@export var fire_rate: float = 0.5
@export var ammo_type: String = "bullet"

# Resources can have methods too
func calculate_dps() -> float:
    return damage / fire_rate`,
				explanation: 'Resources are just data containers. Create a .tres file with these stats, share it across multiple weapons.'
			},
			{
				title: 'Using Resources in Nodes',
				language: 'gdscript',
				code: `# weapon.gd
extends Node2D
class_name Weapon

# Reference to resource (shared)
@export var stats: WeaponStats

func fire():
    if stats:
        var bullet = Bullet.instantiate()
        bullet.damage = stats.damage
        get_parent().add_child(bullet)

# Multiple weapons can share same WeaponStats resource!
# Change the .tres file, all weapons update`,
				explanation: 'The weapon NODE is in the scene tree. The stats RESOURCE is just data, shared by reference. Edit once, affects all.'
			}
		],
		resources: [
			{
				title: 'Godot Docs: Resources',
				url: 'https://docs.godotengine.org/en/stable/tutorials/scripting/resources.html',
				type: 'docs'
			},
			{
				title: 'Resource Base Class Source',
				url: 'https://github.com/godotengine/godot/blob/master/core/io/resource.cpp',
				type: 'source'
			}
		],
		godotConnection: 'Resources are great for game data: item stats, enemy configurations, level data. They\'re like JSON but type-safe and editable in Godot\'s inspector.',
		exercises: [
			'Create a CharacterStats resource with health, speed, jump_height',
			'Share one CharacterStats between multiple enemy instances',
			'Modify the resource at runtime and see all instances update'
		]
	},
	{
		id: 'servers',
		title: 'Server Architecture',
		category: 'internals',
		description: 'Godot\'s internal architecture separates high-level nodes from low-level "server" implementations.',
		keyPoints: [
			'Servers are singletons handling low-level work',
			'RenderingServer: actual GPU rendering',
			'PhysicsServer2D/3D: collision detection, physics simulation',
			'AudioServer: sound mixing and playback',
			'Nodes are "wrappers" that talk to servers'
		],
		codeExamples: [
			{
				title: 'Direct Server Access',
				language: 'gdscript',
				code: `extends Node2D

func _ready():
    # Nodes talk to servers internally, but you CAN access directly

    # Get rendering server info
    var rs = RenderingServer
    print("Video adapter: ", rs.get_video_adapter_name())

    # Direct physics queries
    var space = get_world_2d().direct_space_state
    var query = PhysicsRayQueryParameters2D.create(
        Vector2.ZERO, Vector2(100, 100)
    )
    var result = space.intersect_ray(query)

    # Audio server
    AudioServer.set_bus_volume_db(0, -10)  # Master volume`,
				explanation: 'Servers do the heavy lifting. Sprite2D talks to RenderingServer, RigidBody2D talks to PhysicsServer. You rarely need direct access, but it\'s there.'
			},
			{
				title: 'Why Servers Exist',
				language: 'gdscript',
				code: `# This abstraction lets Godot:

# 1. Run physics on separate thread
# PhysicsServer operates independently of scene tree

# 2. Batch render commands
# RenderingServer collects all draw calls, optimizes

# 3. Swap implementations
# Vulkan vs OpenGL vs Metal - same API

# 4. Enable multiplayer
# Servers can run headless on dedicated server

# High-level (your code):
$Sprite2D.position = Vector2(100, 100)

# Low-level (what happens):
# RenderingServer.canvas_item_set_transform(rid, transform)`,
				explanation: 'The server pattern separates "what to draw" from "how to draw". Your game logic uses friendly node APIs; rendering/physics details are hidden.'
			}
		],
		resources: [
			{
				title: 'Godot Docs: Servers',
				url: 'https://docs.godotengine.org/en/stable/tutorials/performance/using_servers.html',
				type: 'docs'
			},
			{
				title: 'RenderingServer Source',
				url: 'https://github.com/godotengine/godot/blob/master/servers/rendering_server.cpp',
				type: 'source'
			}
		],
		godotConnection: 'This is why Godot can run on so many platforms. The server abstraction means the same game code works on Vulkan, OpenGL, Metal, etc.',
		exercises: [
			'Use PhysicsServer2D to cast a ray without nodes',
			'Monitor server performance with Performance singleton',
			'Change audio bus settings via AudioServer'
		]
	},
	{
		id: 'gdscript-internals',
		title: 'GDScript Internals',
		category: 'internals',
		description: 'How GDScript works under the hood - compilation, the VM, and why it\'s designed the way it is.',
		keyPoints: [
			'GDScript compiles to bytecode, not native code',
			'Optimized for iteration speed, not raw performance',
			'Tight Godot integration (first-class signals, exports)',
			'Garbage collected with reference counting',
			'Why it exists instead of using Python/Lua'
		],
		codeExamples: [
			{
				title: 'GDScript Features',
				language: 'gdscript',
				code: `extends Node2D
class_name Player

# Export to editor - GDScript feature
@export var speed: float = 200.0
@export_range(0, 100) var health: int = 100

# Signals are first-class
signal died
signal health_changed(new_value)

# Onready - runs after _ready
@onready var sprite = $Sprite2D

# Type hints (optional but recommended)
func take_damage(amount: int) -> void:
    health -= amount
    health_changed.emit(health)
    if health <= 0:
        died.emit()`,
				explanation: 'GDScript is designed specifically for games and Godot. @export, signals, @onready are deeply integrated, not library additions.'
			},
			{
				title: 'Performance Considerations',
				language: 'gdscript',
				code: `# GDScript is slower than C++ for raw computation
# But that's rarely the bottleneck!

# BAD: Heavy computation in GDScript
func _process(delta):
    for i in range(10000):
        for j in range(10000):
            # This will be slow
            pass

# GOOD: Let the engine do heavy work
func _process(delta):
    # Physics, rendering, pathfinding - all in C++
    # Your GDScript just coordinates
    if should_move:
        position += velocity * delta  # Fast!

# For genuinely heavy work, use GDExtension (C++)
# Or compute shaders for parallel processing`,
				explanation: 'GDScript\'s job is to orchestrate, not compute. The expensive operations (rendering, physics) are in optimized C++. Your scripts just direct traffic.'
			}
		],
		resources: [
			{
				title: 'GDScript Reference',
				url: 'https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/gdscript_basics.html',
				type: 'docs'
			},
			{
				title: 'GDScript Compiler Source',
				url: 'https://github.com/godotengine/godot/tree/master/modules/gdscript',
				type: 'source'
			}
		],
		godotConnection: 'Understanding GDScript\'s design helps you write idiomatic code. Don\'t fight it - use Godot\'s systems instead of reimplementing in script.',
		exercises: [
			'Compare performance of array operations vs using built-in methods',
			'Profile a script using Godot\'s debugger',
			'Explore what @export generates in the inspector'
		]
	},
	{
		id: 'composition',
		title: 'Composition Over Inheritance',
		category: 'patterns',
		description: 'Building complex behavior from simple, reusable components rather than deep inheritance hierarchies.',
		keyPoints: [
			'Prefer has-a over is-a relationships',
			'Components as child nodes',
			'Mix and match behaviors without inheritance',
			'Easier to test and modify',
			'Godot\'s scene system enables this naturally'
		],
		codeExamples: [
			{
				title: 'Component-Based Design',
				language: 'gdscript',
				code: `# Instead of: Player extends Character extends Entity
# Use composition with component nodes:

# health_component.gd
extends Node
class_name HealthComponent

signal died
signal health_changed(current, max)

@export var max_health: int = 100
var current_health: int

func _ready():
    current_health = max_health

func take_damage(amount: int):
    current_health = max(0, current_health - amount)
    health_changed.emit(current_health, max_health)
    if current_health == 0:
        died.emit()

func heal(amount: int):
    current_health = min(max_health, current_health + amount)
    health_changed.emit(current_health, max_health)`,
				explanation: 'HealthComponent is reusable. Add it to Player, Enemy, Destructible - anything that can take damage.'
			},
			{
				title: 'Assembling Entities',
				language: 'gdscript',
				code: `# Player scene structure:
# Player (CharacterBody2D)
#   ├── Sprite2D
#   ├── CollisionShape2D
#   ├── HealthComponent      <- Reusable!
#   ├── HitboxComponent      <- Reusable!
#   └── InventoryComponent   <- Reusable!

# player.gd
extends CharacterBody2D

@onready var health = $HealthComponent
@onready var hitbox = $HitboxComponent

func _ready():
    # Connect to component signals
    health.died.connect(_on_death)
    hitbox.hit_received.connect(health.take_damage)

func _on_death():
    queue_free()

# Enemy can use same HealthComponent!
# Just different configuration`,
				explanation: 'Player IS a CharacterBody2D but HAS components. Enemy can have the same HealthComponent with different max_health. No inheritance needed.'
			}
		],
		resources: [
			{
				title: 'Game Programming Patterns - Component',
				url: 'https://gameprogrammingpatterns.com/component.html',
				type: 'book'
			},
			{
				title: 'Godot Best Practices',
				url: 'https://docs.godotengine.org/en/stable/tutorials/best_practices/scene_organization.html',
				type: 'docs'
			}
		],
		godotConnection: 'Your tic-tac-toe uses this! TicTacToeSquare is a component. The board composes 9 of them. Squares don\'t inherit from board - they\'re children.',
		exercises: [
			'Create a DamageComponent that can be attached to weapons',
			'Build an entity using only composition (no extends except Node)',
			'Refactor an inheritance hierarchy to use components'
		]
	},
	{
		id: 'state-machines',
		title: 'State Machines',
		category: 'patterns',
		description: 'Managing complex behavior through discrete states and transitions. Essential for game AI and player controllers.',
		keyPoints: [
			'Current state determines behavior',
			'Clear transitions between states',
			'States are mutually exclusive',
			'Avoids spaghetti conditionals',
			'Can be hierarchical (nested states)'
		],
		codeExamples: [
			{
				title: 'Simple State Machine',
				language: 'gdscript',
				code: `extends CharacterBody2D

enum State { IDLE, WALKING, JUMPING, FALLING }
var current_state: State = State.IDLE

func _physics_process(delta):
    match current_state:
        State.IDLE:
            _state_idle(delta)
        State.WALKING:
            _state_walking(delta)
        State.JUMPING:
            _state_jumping(delta)
        State.FALLING:
            _state_falling(delta)

func _state_idle(delta):
    if Input.is_action_pressed("move"):
        _change_state(State.WALKING)
    elif Input.is_action_just_pressed("jump"):
        _change_state(State.JUMPING)

func _change_state(new_state: State):
    # Exit current state
    _exit_state(current_state)
    # Enter new state
    current_state = new_state
    _enter_state(new_state)

func _enter_state(state: State):
    match state:
        State.JUMPING:
            velocity.y = JUMP_FORCE
            $AnimationPlayer.play("jump")`,
				explanation: 'Each state has clear entry, update, and exit logic. The match statement replaces nested if/else chains.'
			},
			{
				title: 'State as Node (Advanced)',
				language: 'gdscript',
				code: `# state.gd - Base state class
extends Node
class_name State

signal transition_requested(new_state_name)

func enter() -> void:
    pass

func exit() -> void:
    pass

func update(delta: float) -> void:
    pass

func physics_update(delta: float) -> void:
    pass

# idle_state.gd
extends State

func enter():
    owner.animation_player.play("idle")

func physics_update(delta):
    if Input.is_action_pressed("move"):
        transition_requested.emit("Walking")
    elif not owner.is_on_floor():
        transition_requested.emit("Falling")`,
				explanation: 'States as nodes allows adding them to the scene tree. The state machine manages which state is active and handles transitions.'
			}
		],
		resources: [
			{
				title: 'Game Programming Patterns - State',
				url: 'https://gameprogrammingpatterns.com/state.html',
				type: 'book'
			},
			{
				title: 'Godot State Machine Tutorial',
				url: 'https://docs.godotengine.org/en/stable/tutorials/best_practices/finite_state_machine.html',
				type: 'docs'
			}
		],
		godotConnection: 'Your tic-tac-toe game has implicit states: PLAYER_X_TURN, PLAYER_O_TURN, GAME_OVER. Making this explicit improves code clarity.',
		exercises: [
			'Add a state machine to track game turns explicitly',
			'Create a simple enemy AI with PATROL, CHASE, ATTACK states',
			'Implement a door with CLOSED, OPENING, OPEN, CLOSING states'
		]
	}
];

export const categories = [
	{ id: 'fundamentals', title: 'Engine Fundamentals', icon: '⚙️' },
	{ id: 'architecture', title: 'Architecture Patterns', icon: '🏗️' },
	{ id: 'patterns', title: 'Design Patterns', icon: '🎯' },
	{ id: 'internals', title: 'Under the Hood', icon: '🔧' }
] as const;

export type Category = typeof categories[number]['id'];
