<?php

namespace Drupal\ict_busroutes\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\Core\Block\BlockManagerInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Bus Routes controller.
 */
class BusRoutesController extends ControllerBase {

  /**
   * The block manager.
   *
   * @var \Drupal\Core\Block\BlockManagerInterface
   */
  protected $blockManager;

  /**
   * Constructs a BusRoutesController object.
   *
   * @param \Drupal\Core\Block\BlockManagerInterface $block_manager
   *   The block manager.
   */
  public function __construct(BlockManagerInterface $block_manager) {
    $this->blockManager = $block_manager;
  }

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container) {
    return new static(
      $container->get('plugin.manager.block')
    );
  }

  /**
   * Returns the React application page.
   *
   * @return array
   *   Render array for the React application.
   */
  public function app() {
    $config = [];
    $plugin_block = $this->blockManager->createInstance('bus_routes_app_block', $config);

    return $plugin_block->build();
  }

}
